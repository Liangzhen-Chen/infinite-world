import {capacity,actionEntity,actionAge} from './action-capacity.mjs';
import {authority} from './action-authority.mjs';
import {PrimitiveRejected} from './primitive-policy.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {legalCodeAt} from './law-codes.mjs';
import {subjectiveView,conversationLanguage} from './subjective-view.mjs';
import {npcDecision} from './npc-decision.mjs';

declareHoldingWriter('action-consent',{kinds:['permit']});
const minorIntimacy=(context,from,to,scope,purpose)=>/romance|intima|恋爱|亲密/.test(`${scope} ${purpose??''}`)&&[from,to].some(id=>id!=='player'&&(actionEntity(context,id)?.minor||actionEntity(context,id)?.flags?.minor||actionAge(context,id)<18));

// Consent events are an append-only fact list; a write replaces the array.
// Index each array once by donor/recipient pair, donor and id so reads touch
// only the relevant rows instead of scanning (and re-slicing) the whole list.
const consentIndexes=new WeakMap();
export function consentIndex(events){
 if(!Array.isArray(events))return {pair:()=>[],from:()=>[],byId:()=>undefined};
 let index=consentIndexes.get(events);
 if(!index||index.length!==events.length){
  const pairs=new Map(),froms=new Map(),ids=new Map();
  events.forEach((row,i)=>{
   if(!row||typeof row!=='object')return;
   const pair=`${row.from}\u0000${row.to}`;
   (pairs.get(pair)??pairs.set(pair,[]).get(pair)).push(i);
   (froms.get(row.from)??froms.set(row.from,[]).get(row.from)).push(i);
   if(typeof row.id==='string'&&!ids.has(row.id))ids.set(row.id,row);
  });
  index={length:events.length,pairs,froms,ids};consentIndexes.set(events,index);
 }
 return {pair:(from,to)=>(index.pairs.get(`${from}\u0000${to}`)??[]).map(i=>events[i]),from:from=>(index.froms.get(from)??[]).map(i=>events[i]),byId:id=>index.ids.get(id)};
}
const termKeys=new Set(['fee','minutes','principal','days','interest','totalCoins','purpose','spell','waterBatch','role','amount','allowed','saleAllowed','price','atMinute','item','quantity','prepayment','deadline','location','installments']);
const tenancyEnums={rentMode:['fixed','share'],outputBasis:['gross','net'],netInputs:['consumed-seed'],rentPayment:['cash','kind'],inputPayer:['tenant','owner','shared'],unharvestedCrops:['tenant','owner'],farmOperator:['tenant','owner']};
const tenancyNumbers=['shareNumerator','shareDenominator','ownerInputNumerator','ownerInputDenominator','cropPriceNumerator','cropPriceDenominator','seedPriceNumerator','seedPriceDenominator'];
const tenancyRatios=[['shareNumerator','shareDenominator'],['ownerInputNumerator','ownerInputDenominator'],['cropPriceNumerator','cropPriceDenominator'],['seedPriceNumerator','seedPriceDenominator']];
for(const key of [...Object.keys(tenancyEnums),...tenancyNumbers])termKeys.add(key);
export function validConsentTerms(terms){
 if(!terms||typeof terms!=='object'||Array.isArray(terms)||Object.keys(terms).some(k=>!termKeys.has(k)))return false;
 return Object.entries(terms).every(([k,v])=>tenancyEnums[k]?tenancyEnums[k].includes(v):['purpose','spell','waterBatch','role','item','location'].includes(k)?typeof v==='string'&&v.length>0&&v.length<=120:k==='allowed'?Array.isArray(v)&&v.length>0&&v.every(x=>typeof x==='string'&&x.length>0):k==='saleAllowed'?typeof v==='boolean':Number.isSafeInteger(v)&&v>=0&&(!k.endsWith('Denominator')||v>0));
}
function sameTerm(a,b,key){
 const pair=tenancyRatios.find(p=>p.includes(key));
 if(!pair)return a?.[key]===b?.[key];
 const [n,d]=pair;
 return pair.every(k=>Number.isSafeInteger(a?.[k])&&a[k]>=0&&Number.isSafeInteger(b?.[k])&&b[k]>=0)&&a[d]>0&&b[d]>0&&BigInt(a[n])*BigInt(b[d])===BigInt(b[n])*BigInt(a[d]);
}
const termsMatch=(required,actual)=>Object.entries(required??{}).every(([k,v])=>Array.isArray(v)?Array.isArray(actual?.[k])&&v.length===actual[k].length&&v.every((x,i)=>x===actual[k][i]):sameTerm(required,actual,k))&&
 // An earlier amount-only agreement grants neither a different rent system
 // nor a disposal right over the tenant's future crop or input investment.
 [...Object.keys(tenancyEnums),...tenancyNumbers].every(k=>actual?.[k]===undefined||sameTerm(required,actual,k));

// A legacy lending call has principal/days slots but no interest slot. Read an
// actual borrower's offer, never a proposal's claim that the borrower agreed.
export function agreedLoan(context,borrower,creditor,{principal,days,interest,subject=creditor,until=context.document.state.minute}){
 const offers=consentIndex(context.document.state.consentEvents).pair(borrower,creditor).filter(row=>row.type==='consent_given'&&row.from===borrower&&row.to===creditor&&row.scope==='loan'&&row.subject===subject&&row.terms?.principal===principal&&row.terms?.days===days&&Number.isSafeInteger(row.terms.interest)&&row.terms.interest>=0&&(interest===undefined||row.terms.interest===interest));
 const valid=offers.map(row=>{
  const terms={principal,days,interest:row.terms.interest};
  return {terms,permission:consent(context,borrower,creditor,'loan',{purpose:creditor,subject,terms,until,onRefusal:'abort'})};
 }).filter(row=>row.permission.allowed);
 const terms=[...new Set(valid.map(row=>JSON.stringify(row.terms)))];
 return terms.length===1?valid[0]:null;
}

// Native contract requests use current NPC facts, never a caller's answer.
// Callers supply derived costs and exact terms after checking presence/capacity.
export function requestContractConsent(d,engine,{from,to='player',scope,subject,purpose=subject,terms,cost,reward=0,prepaid=false,eventId,until=d.get('state','minute')}){
 const exactTenancy=scope==='rent'&&terms?.rentMode!==undefined;
 const context=()=>{
  const document=d.document;
  if(!exactTenancy)return {engine,document};
  // A broad historical rent grant is not consent to new economic/disposal
  // clauses. Keep revocations and only grants that bind these exact terms.
  const matches=row=>row.terms&&validConsentTerms(row.terms)&&termsMatch(row.terms,terms);
  return {engine,document,consentEvents:(document.state.consentEvents??[]).filter(row=>row.type==='consent_revoked'||matches(row)),
   authorizationRecords:Object.entries(document.state.records??{}).filter(([,row])=>row.category==='authorization'&&matches(row))};
 };
 const permission=consent(context(),from,to,scope,{subject,purpose,terms,until,onRefusal:'abort'});
 if(permission.allowed)return permission;
 const view=subjectiveView(engine,d.document,from);
 if(!conversationLanguage(view,engine,d))return permission;
 // Rescheduling this contract is not a competing new obligation.
 if(scope==='amend')view.self.obligations=view.self.obligations.filter(row=>row.id!==subject);
 const decision=npcDecision(view,{kind:scope,from:to,cost,reward,...(prepaid?{prepaid:true}:{})});
 if(decision.outcome!=='agree')return {...permission,reason:decision.reason,conditions:decision.conditions};
 const id=`${eventId}:consent`,payload={scope,subject,purpose:[purpose],terms,until:until+1};
 applyConsentEvent(d,context(),{actor:from,eventId:id,verb:'consent_given',to,payload});
 // The append-only native consent row is the agreement's saved provenance.
 return consent(context(),from,to,scope,{subject,purpose,terms,until,onRefusal:'abort'});
}

// The legacy learning handler has already derived the registered subject,
// price and duration. Proposal flags never supply these agreement terms.
function nativeConsentTerms(context,from,to,scope,purpose){
 if(['cast','mental_magic','support_magic','healing'].includes(scope)&&typeof purpose==='string'&&purpose.startsWith('spell_'))return {spell:purpose};
 const native=context.engine?.nativeConsentRequest;
 if(native?.from===from&&native.to===to&&native.scope===scope&&native.purpose===purpose)return native.terms;
 const call=context.engine?.npcObligationAction;
 if(scope==='teach'&&call?.tool==='learn'&&to==='player'){
  const e=context.engine,args=call.args;
  let teacher,subject;try{teacher=e.resolve(args.source);subject=e.resolve(args.entity,args.kind);}catch{return null;}
  if(teacher!==from||subject!==purpose)return null;
  const catalog=e.byId.get(subject);
  return {fee:catalog.learnFee??12,minutes:catalog.learnMinutes??120};
 }
 return null;
}

// events are persisted, engine-observed consent facts, not a proposal's args.
export function consent(context,from,to,scope,{purpose=null,subject=null,terms=null,until=context.document.state?.minute??0,onRefusal='contest'}={}){
 if(minorIntimacy(context,from,to,scope,purpose))return {allowed:false,kind:'none',source:null,check:'abort',tags:[],reason:'未成年人物只进行正常互动'};
 terms??=nativeConsentTerms(context,from,to,scope,purpose);
 const now=context.document.state?.minute??0,level=capacity(context,from,scope).level;
 if(!Number.isSafeInteger(until)||until<now)return {allowed:false,kind:'none',source:null,check:'abort',tags:[],reason:'Consent must cover the current or a future minute'};
 // Only the donor's own rows can grant or revoke this consent (a revocation
 // always names its donor; it may name the consent id instead of a recipient).
 const events=consentIndex(context.consentEvents??context.document.state?.consentEvents).from(from);
 const result=(kind,source)=>({allowed:true,kind,source,check:null,tags:[]});
 const needsProxy=level==='none'||level==='limited'&&['mind','memory','property','transfer','mental_magic'].includes(scope);
 let purposeMismatch=false,conditionalMismatch=false;
 const revokedIds=new Set();let scopeRevoked=false;
 for(let i=events.length-1;i>=0;i--){
  const e=events[i];
  if(e.type==='consent_revoked'&&(e.at??0)<=now){if(e.consent!==undefined)revokedIds.add(e.consent);if(e.to===to&&(e.scope===undefined||e.scope===scope))scopeRevoked=true;continue;}
  const cast=e.scope==='cast'&&['mental_magic','support_magic','healing'].includes(scope)&&e.subject===from&&e.terms?.spell===purpose;
  if(e.type!=='consent_given'||typeof e.id!=='string'||!Number.isSafeInteger(e.at)||e.from!==from||e.to!==to||!(cast||(Array.isArray(e.scope)?e.scope.includes(scope):e.scope===scope))||e.at>now||e.until!==undefined&&(!Number.isSafeInteger(e.until)||e.until<=until))continue;
  if(revokedIds.has(e.id)||scopeRevoked)continue;
  if(e.purpose!==undefined&&!Array.isArray(e.purpose))continue;
  if(e.purpose?.length&&!e.purpose.includes(purpose)){purposeMismatch=true;continue;}
  if(e.subject!==undefined&&e.subject!==(subject??(cast||scope==='cast'?from:purpose))){purposeMismatch=true;continue;}
  if(e.terms!==undefined&&(!validConsentTerms(e.terms)||!termsMatch(e.terms,terms))){conditionalMismatch=true;continue;}
  if(!e.by||e.by===from){if(!needsProxy&&level!=='none')return result('given',e.id);continue;}
  const a=authority(context,e.by,'consent',from,{consentScope:scope});
  if(capacity(context,e.by,scope).level==='full'&&a.allowed&&a.sources.some(s=>s.kind!=='self'&&s.kind!=='owns'&&s.kind!=='operates'))return result('proxy',e.id);
 }
 // Existing spell permissions are factual grants, with their actual purpose,
 // spell/location limits and revocation. Free text is never widened to all uses.
 const action=({mind:'mental_magic',memory:'mental_magic'})[scope]??scope;
 // A caller that already knows the only authorization in play passes it as context.authorizationRecords.
 if(!needsProxy)for(const [id,row] of context.authorizationRecords??Object.entries(context.document.state?.records??{})){
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
 if(!needsProxy&&!conditionalMismatch){const decision=context.consentDecision?.({from,to,scope,purpose,until});if(decision?.decision==='agree'&&decision.source)return result('given',decision.source);}
 return {allowed:false,kind:'none',source:null,check:onRefusal==='abort'?'abort':'contest',tags:conditionalMismatch?['unconsented','unconsented:terms']:purposeMismatch?['unconsented','unconsented:purpose']:['unconsented'],reason:'没有覆盖本次用途与期限的有效同意'};
}

// Native emit adapter. The actor comes from the frame. A proposal cannot assert
// another person's agreement; proxy grants require current authority facts.
export function applyConsentEvent(d,context,{actor,eventId,verb,to,payload={}}){
 const fail=message=>{throw new PrimitiveRejected('E-CONSENT',message);},document=d.document,live={...context,document},now=document.state.minute;
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(k=>!['from','scope','purpose','subject','terms','until','consent'].includes(k)))fail('Invalid consent event payload');
 if(typeof eventId!=='string'||!eventId)fail('Consent needs a native event id');
 const events=d.get('state','consentEvents')??[],index=consentIndex(events),given=payload.consent&&index.byId(payload.consent),old=payload.consent&&(given?.type==='consent_given'?given:d.get('state','records',payload.consent));
 const from=verb==='consent_revoked'?(old?.from??old?.subject):payload.from??actor;
 const recipient=verb==='consent_revoked'?(old?.to??old?.grantee):to,scope=verb==='consent_revoked'?(old?.category==='authorization'?old.action:old?.scope):payload.scope;
 if(!from||!recipient||payload.from&&payload.from!==from||to&&to!==recipient)fail('Consent must refer to its actual donor and recipient');
 const realAgent=id=>id==='player'||Object.hasOwn(document.state.npcs??{},id)||Object.hasOwn(document.state.creatures??{},id);
 if(!realAgent(from)||!realAgent(recipient))fail('Consent parties must be current agents');
 if(actor!==from){const grant=authority(live,actor,'consent',from,{consentScope:scope});if(capacity(live,actor,scope).level!=='full'||!grant.allowed||!grant.sources.some(s=>!['self','owns','operates'].includes(s.kind)))fail('No current proxy authority');}
 if(verb==='consent_given'){
  if(typeof scope!=='string'||!scope||scope.length>120||!Number.isSafeInteger(payload.until)||payload.until<=now)fail('Consent needs a scope and future expiry');
  if(payload.purpose!==undefined&&(!Array.isArray(payload.purpose)||!payload.purpose.length||payload.purpose.length>16||payload.purpose.some(p=>typeof p!=='string'||!p||p.length>120)))fail('Invalid consent purposes');
  if(payload.subject!==undefined&&(typeof payload.subject!=='string'||!payload.subject||payload.subject.length>200)||payload.terms!==undefined&&!validConsentTerms(payload.terms))fail('Invalid consent subject or conditional terms');
  if(index.byId(eventId))fail('Consent event already exists');
  if(minorIntimacy(live,from,recipient,scope,payload.purpose))fail('Minor NPC cannot consent to intimacy');
  const level=capacity(live,from,scope).level;
  if(actor===from&&(level==='none'||level==='limited'&&['mind','memory','property','transfer','mental_magic'].includes(scope)))fail('This donor requires a genuine proxy');
  const row={id:eventId,type:verb,from,to:recipient,scope,at:now,until:payload.until,...(payload.purpose?{purpose:[...payload.purpose]}:{}),...(payload.subject!==undefined?{subject:payload.subject}:{}),...(payload.terms!==undefined?{terms:structuredClone(payload.terms)}:{}),...(actor!==from?{by:actor}:{})};
  d.set(['state','consentEvents'],[...events,row]);
  return row;
 }
 if(verb!=='consent_revoked'||!old||old.revoked||(old.until??old.expires??Infinity)<=now||index.from(old.from??old.subject).some(e=>e.type==='consent_revoked'&&e.consent===payload.consent&&e.at<=now))fail('No active consent to revoke');
 if(old.category&&old.category!=='authorization')fail('Record is not a consent authorization');
 const row={id:eventId,type:verb,from,to:recipient,consent:payload.consent,at:now};
 if(old.category==='authorization')holdingSet(d,context.engine,['state','records',payload.consent],{...old,revoked:true,revokedAt:now,revokedBy:actor},'action-consent',eventId);
 d.set(['state','consentEvents'],[...events,row]);return row;
}
