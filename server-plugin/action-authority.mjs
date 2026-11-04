import {aliveHoldings,holdingKind,locationOf,located,declareHoldingWriter,holdingSet,isEffective} from './holdings.mjs';
import {settlementGovernment,groupView} from './entity-view.mjs';
import {temples} from './faith-catalog.mjs';
import {initialNpcState} from './npc-state.mjs';
import {worldEvent} from './world-events.mjs';
import {consent} from './action-consent.mjs';
import {effective} from './holding-kinds.mjs';
import {parseAccount} from './ledger.mjs';
import {obligationRows,obligationClosed} from './obligation-state.mjs';
import {actionEntity,actionReader,capacity,canAct} from './action-capacity.mjs';
import {createPrimitiveFrame} from './primitives.mjs';
import {digest,recordsMemo} from './storage.mjs';
import {reject} from './primitive-policy.mjs';

declareHoldingWriter('action-authority',{kinds:[]});
// Catalog NPCs outside the active simulation already exist. Read their native
// initial body without moving/materializing them or creating an office holder.
function controllerCapacity(context,id){
 const s=context.document.state,base=context.engine?.world.npcs.find(n=>n.id===id);
 if(!isEffective(context.engine,context.document,id))return {level:'none'};
 if(id==='player'||s.npcs?.[id]||s.creatures?.[id]||!base)return capacity(context,id,'consent');
 return capacity({...context,document:{...context.document,state:{...s,npcs:{...s.npcs,[id]:initialNpcState(base)}}}},id,'consent');
}
// Native title/operation holdings override catalog ownership. Custody and
// merely being present never confer issuing authority.
const controllerHistory=Symbol('title and operation history by subject');
export function currentControllers(context,subject,{ownerOnly=false,principals=false}={}){
 const d=actionReader(context.document),kinds=ownerOnly?['owns']:['operates','owns'];
 const held=aliveHoldings(d,{subject}).filter(h=>kinds.includes(h.kind)&&effective(d,h.id));
 const operators=held.filter(h=>h.kind==='operates');
 const s=context.document.state,e=context.engine;
 const representatives=ids=>[...new Set(ids.flatMap(id=>{
  if(principals)return [id];
  if(id==='player'||s.npcs?.[id]||s.creatures?.[id]||e?.world.npcs.some(n=>n.id===id))return [id];
  // A collective retains its title; its current legal representative signs.
  // Vacant offices and organizations without a leader confer no signature.
  const head=e&&settlementGovernment(e,s,id).head.value,leader=e&&groupView(e,s,id)?.leader.value;
  return [...new Set([head,leader].filter(Boolean))];
 }))];
 let base=e?.byId.get(subject);
 if(base==null&&e){
  for(const p of e.world.locations){const f=p.features?.find(f=>f.id===subject);if(f){base={...f,location:p.id};break;}}
  if(base==null)for(const p of e.world.locations){const station=p.workstations?.find(f=>f.id===subject);if(station){base=station;break;}}
 }
 const catalog={...base,...s.created?.[subject],...context.document.holdings?.entities?.[subject]?.facts};
 const building=s.buildings?.[subject];
 const override=building&&Object.hasOwn(building,'owner');
 if(operators.length)return representatives(operators.map(h=>h.holder));
 if(held.length&&(ownerOnly||held.some(h=>h.holder!==catalog?.owner)))return representatives(held.map(h=>h.holder));
 // A terminated native title/management grant cannot revive catalog rights.
 if(!held.length&&kinds.some(kind=>recordsMemo(context.document.holdings?.rows,controllerHistory,()=>{
  const subjects=new Map();
  for(const h of Object.values(context.document.holdings?.rows??{})){
   const kinds=subjects.get(h.subject)??new Set();kinds.add(h.kind);subjects.set(h.subject,kinds);
  }
  return subjects;
 }).get(subject)?.has(kind)))return [];
 if(override)return typeof building.owner==='string'?representatives([building.owner]):[];
 if(!ownerOnly){
  const manager=catalog?.site?.manager??catalog?.lodging?.host;
  if(manager)return representatives([manager]);
  // Native temple organizations already define the institution's principal.
  const organizations=e?temples(e).filter(t=>t.seat===subject):[];
  if(organizations.length)return representatives(organizations.map(t=>groupView(e,s,t.id)?.leader.value).filter(Boolean));
 }
 return held.length?representatives(held.map(h=>h.holder)):typeof catalog?.owner==='string'?representatives([catalog.owner]):[];
}
function currentIssuer(context,subject,issuer){
 if(currentControllers(context,subject).includes(issuer))return controllerCapacity(context,issuer).level==='full';
 // A corpus event can be issued in the collective's own name. Its existing
 // current representative supplies capacity; a bystander cannot sign for it.
 const agents=currentControllers(context,subject);
 return currentControllers(context,subject,{principals:true}).includes(issuer)&&agents.length===1&&controllerCapacity(context,agents[0]).level==='full';
}
export function resolveAuthoritySelector(context,value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['role','of'].includes(k))||typeof value.of!=='string')reject('E-AUTHORITY-SELECTOR','Invalid authority selector');
 if(value.role==='existing_legal_town_head'){
  const id=settlementGovernment(context.engine,context.document.state,value.of).head.value;
  if(id&&actionEntity(context,id)&&controllerCapacity(context,id).level==='full')return id;
  reject('E-AUTHORITY-SELECTOR','No existing legal town head');
 }
 if(!['authorized_owner','authorized_manager'].includes(value.role))reject('E-AUTHORITY-SELECTOR','Unknown authority selector');
 const ids=currentControllers(context,value.of,{ownerOnly:value.role==='authorized_owner'});
 if(ids.length!==1||controllerCapacity(context,ids[0]).level!=='full')reject('E-AUTHORITY-SELECTOR',`Authority selector needs one existing capable owner/manager agent: ${value.of}`);
 return ids[0];
}
export function grantLimitedPermit(d,context,grant){
 const {actor,id,holder,subject,scope,fromMinute,toMinute,sourceEvent,quantityLiters,includedInLessonFee}=grant,live={...context,document:d.document};
 if(Object.keys(grant).some(k=>!['actor','id','holder','subject','scope','fromMinute','toMinute','sourceEvent','quantityLiters','includedInLessonFee'].includes(k))||![id,holder,subject,scope].every(v=>typeof v==='string'&&v.length>0)||!actionEntity(live,holder)||!Number.isSafeInteger(fromMinute)||fromMinute<0||!Number.isSafeInteger(toMinute)||toMinute<=fromMinute||quantityLiters!==undefined&&(!Number.isSafeInteger(quantityLiters*1000)||quantityLiters<=0)||includedInLessonFee!==undefined&&typeof includedInLessonFee!=='boolean')reject('E-PERMIT','Invalid limited permit');
 if(!currentIssuer(live,subject,actor))reject('E-PERMIT-AUTHORITY','Only the current owner/manager may grant this permit');
 const event=worldEvent(d.get('state'),sourceEvent);
 if(!event||event.verb!=='permission_granted'||event.actor!==actor||event.subject!==subject||event.to!==holder||event.scope!==scope||event.minute!==fromMinute)reject('E-PERMIT-SOURCE','Permit does not match its source event');
 const key=`limited_permit:${id}`;
 if(d.get('state','records',key))reject('E-PERMIT','Permit already exists');
 const row={id,category:'limited_permit',issuer:actor,holder,subject,scope,fromMinute,toMinute,sourceEvent,usedMl:0,...(quantityLiters!==undefined?{quantityLiters}:{}),...(includedInLessonFee!==undefined?{includedInLessonFee}:{})};
 holdingSet(d,context.engine,['state','records',key],row,'action-authority',sourceEvent);return row;
}
export function limitedPermit(context,holder,subject,scope,{until=context.document.state.minute,quantityLiters=0}={}){
 const now=context.document.state.minute;
 const millilitres=quantityLiters*1000;
 if(!Number.isSafeInteger(until)||until<now||!Number.isSafeInteger(millilitres)||millilitres<0)return null;
 return Object.values(context.document.state.records??{}).find(r=>r.category==='limited_permit'&&r.holder===holder&&r.subject===subject&&r.scope===scope&&!r.revoked&&r.fromMinute<=now&&until<r.toMinute&&currentIssuer(context,subject,r.issuer)&&(r.quantityLiters===undefined||millilitres>0&&r.usedMl+millilitres<=r.quantityLiters*1000))??null;
}
export function consumeLimitedPermit(d,context,id,liters){
 const row=d.get('state','records',`limited_permit:${id}`),live={...context,document:d.document};
 if(!row||limitedPermit(live,row.holder,row.subject,row.scope,{quantityLiters:liters})?.id!==id)reject('E-PERMIT','Permit quantity or validity exceeded');
 holdingSet(d,context.engine,['state','records',`limited_permit:${id}`],{...row,usedMl:row.usedMl+liters*1000},'action-authority');
}
export function revokeLimitedPermit(d,context,{actor,id}){
 const key=`limited_permit:${id}`,row=d.get('state','records',key),live={...context,document:d.document};
 if(!row||row.category!=='limited_permit'||actor!==row.issuer&&!currentControllers(live,row.subject).includes(actor)||controllerCapacity(live,actor).level!=='full')reject('E-PERMIT-AUTHORITY','No authority to revoke this permit');
 if(row.revoked)return row;
 const revoked={...row,revoked:true,revokedAt:d.get('state','minute'),revokedBy:actor};
 holdingSet(d,context.engine,['state','records',key],revoked,'action-authority');return revoked;
}

const scoped=(scope,op,target)=>Array.isArray(scope)&&scope.some(s=>typeof s==='string'?s===op:s?.op===op&&(s.target===undefined||s.target===target));
const scopeEntry=s=>typeof s==='string'?s.length>0:s&&typeof s==='object'&&!Array.isArray(s)&&typeof s.op==='string'&&s.op.length>0&&Object.keys(s).every(k=>['op','target'].includes(k))&&(s.target===undefined||typeof s.target==='string');
export const validMandateScope=scope=>Array.isArray(scope)&&scope.length>0&&scope.every(scopeEntry);
const scopeWithin=(child,parent)=>validMandateScope(child)&&validMandateScope(parent)&&child.every(s=>{const op=typeof s==='string'?s:s.op,target=typeof s==='string'?undefined:s.target;return scoped(parent,op,target);});
const mandateUntil=m=>Math.min(m.until??Infinity,m.expires??Infinity,m.terms?.until??Infinity,m.terms?.expires??Infinity);
// Child mandates keep a live dependency on every ancestor, including scope and
// expiry. Persisted terms alone cannot outlive a revoked delegation (01 §1.4).
export function currentMandates(context){
 const rows=obligationRows(context.document.state??{}),now=context.document.state?.minute??0,byId=new Map(rows.map(m=>[m.id,m]));
 const live=(m,seen=new Set())=>{
  if(!m||(m.kind??m.obligationKind)!=='mandate'||seen.has(m.id)||obligationClosed(m)||m.endedAt!==undefined||m.revoked||(m.since??m.createdAt??0)>now||mandateUntil(m)<=now)return false;
  if(!m.terms?.parentMandate)return true;
  const p=byId.get(m.terms.parentMandate);seen.add(m.id);
  return live(p,seen)&&p.creditor===m.creditor&&p.debtor!==m.debtor&&p.terms?.subdelegate===true&&scopeWithin(m.terms.scope,p.terms.scope)&&mandateUntil(m)<=mandateUntil(p);
 };
 return rows.filter(m=>live(m));
}
export function mandateParent(context,{creditor,debtor,terms}){
 const p=currentMandates(context).find(m=>m.id===terms?.parentMandate);
 if(!p||p.creditor!==creditor||p.debtor===debtor||p.terms?.subdelegate!==true||!scopeWithin(terms.scope,p.terms.scope)||mandateUntil({terms})>mandateUntil(p))reject('E-MANDATE-SCOPE','Subdelegation must stay within a current parent mandate scope and expiry');
 return p;
}
const propertyObligations=new Set(['loan','deposit','bill','rent','wage','dividend','salary','tax','compensation','forward','bounty']);
export function possessor(context,target){
 const d=actionReader(context.document),seen=new Set();let id=target;
 while(id&&!seen.has(id)){seen.add(id);const loc=locationOf(d,id);if(!loc)break;
  if(loc.mode==='carried')return loc.at;
  const operator=aliveHoldings(d,{kind:'operates',subject:loc.at}).find(h=>effective(d,h.id));
  if(operator)return operator.holder;id=loc.at;
 }return null;
}
export function authority(context,actor,op,target,{disposition=false,consentScope=null,holding=null,kind=null,variant=null,holder=null,reason=null,shares=null,effect=null,until=null}={}){
 const d=actionReader(context.document),sources=[],excess=[],tags=[];let account=null;
 if(typeof target==='string'&&target.includes('|'))account=parseAccount(target);
 // Protected purpose is never an ordinary possession/office exception.
 if(account&&/^(escrow|collected)(:|$)/.test(account.purpose))return {allowed:false,sources,tags,actedAs:null,reason:'托管用途只能由对应义务清偿、解缴或判决动用'};
 const subject=account?.owner??target;
 if(!actionEntity(context,actor)||capacity(context,actor,op).level==='none')return {allowed:false,sources,tags,actedAs:null,reason:'行动者当前不能行使权能'};
 const legal=['banished','wanted','frozen'].includes(kind??holding?.kind)||(kind??holding?.kind)==='guest_of'&&(variant??holding?.variant)==='detained';
 if(subject===actor&&!legal&&!op.startsWith('holding.'))sources.push({kind:'self',id:actor});
 if(op==='holding.close'&&holding&&!legal&&[holding.holder,holding.grantedBy].includes(actor))sources.push({kind:'holding',id:holding.id});
 const holdings=aliveHoldings(d,{holder:actor});
 // A finite use grant confers exactly its named operation on its subject.
 // It never becomes ownership, disposition or a right to issue new grants.
 if(!legal&&!['holding.open','holding.transfer','holding.rescale','transfer','consent'].includes(op)){
  const permit=limitedPermit(context,actor,subject,op,{until:until??context.document.state.minute,quantityLiters:effect?.quantityLiters??0});
  if(permit)sources.push({kind:'permit',id:permit.id,source:permit.sourceEvent,version:digest(permit)});
 }
 if(op==='obligation.create'&&effect?.obligationKind==='loan'&&subject===effect.debtor){
  const terms=effect.terms??{},now=context.document.state.minute;
  // Duplicated proposal terms cannot disguise a different debt or duration.
  const consistent=(terms.resource===undefined||['coin','coin_river'].includes(terms.resource))&&
   (terms.principal===undefined||Number.isSafeInteger(terms.principal)&&Number.isSafeInteger(terms.interest??0)&&effect.amount===terms.principal+(terms.interest??0))&&
   (terms.days===undefined||Number.isSafeInteger(terms.days)&&terms.days>0&&effect.deadline===now+terms.days*1440);
  if(consistent){
   const agreement=consent(context,subject,actor,'loan',{purpose:effect.creditor,subject:effect.creditor,terms,until:until??now,onRefusal:'abort'});
   if(agreement.allowed)sources.push({kind:'consent',id:agreement.source});
  }
 }
 if(op==='obligation.settle'&&effect?.id&&Number.isSafeInteger(effect.amount)&&effect.amount>0){
  const claim=obligationRows(context.document.state).find(row=>row.id===effect.id);
  if(claim?.debtor===subject&&claim.creditor===actor){
   const agreement=consent(context,subject,actor,'repay',{purpose:claim.id,subject:claim.id,terms:{amount:effect.amount},until:until??context.document.state.minute,onRefusal:'abort'});
   if(agreement.allowed)sources.push({kind:'consent',id:agreement.source});
  }
 }
 const usable=h=>effective(d,h.id,{alive:id=>capacity(context,id,op).level!=='none',impaired:id=>capacity(context,id,op).level==='none'});
 for(const h of holdings){
  if(!usable(h))continue;
  const definition=holdingKind(h.kind),powers=h.terms?.authority??definition?.derives?.authority;
  const obligation=op==='obligation.create'?effect:effect?.id&&obligationRows(context.document.state??{}).find(row=>row.id===effect.id);
  const propertyOperation=['transfer','holding.transfer','holding.open','fact.set'].includes(op)||op.startsWith('obligation.')&&propertyObligations.has(obligation?.obligationKind??obligation?.kind);
  const guardian=h.kind==='guardian_of'&&(h.terms?.scope!=='property_only'||(op==='consent'?['property','transfer'].includes(consentScope):propertyOperation));
  const propertyOpening=op!=='holding.open'||['owns','pledged','leases','operates'].includes(kind);
  if(h.subject===subject&&(!legal&&propertyOpening&&(['owns','operates'].includes(h.kind)||guardian)&&['transfer','holding.transfer','holding.open','fact.set','consent','obligation.create','obligation.settle','obligation.cancel','move',...(h.kind==='owns'?['destroy']:[])].includes(op)||scoped(powers,op,subject)))sources.push({kind:h.kind,id:h.id,subject:h.subject});
  else if(scoped(powers,op,subject))sources.push({kind:h.kind,id:h.id,subject:h.subject});
  else if(!legal&&h.subject===subject&&['holds_office','appointed','commands','operates'].includes(h.kind)&&Array.isArray(powers)&&powers.length)excess.push({kind:h.kind,id:h.id,subject:h.subject,version:digest(h),tags:['ultra_vires']});
 }
 // A registered unit or living body records its owner natively when no owns
 // holding was opened for it; that title confers the same disposition (K7).
 const native=context.document.state?.itemInstances?.[subject]??context.document.state?.creatures?.[subject];
 if(!legal&&native?.owner===actor&&!aliveHoldings(d,{kind:'owns',subject}).length&&['destroy','move','fact.set','transfer'].includes(op))sources.push({kind:'owner',id:subject});
 const mandates=currentMandates(context).filter(o=>o.debtor===actor);
 for(const m of mandates){
  const principalControls=subject===m.creditor||aliveHoldings(d,{holder:m.creditor,subject}).some(h=>h.kind==='owns'?effective(d,h.id):['operates','guardian_of'].includes(h.kind)&&usable(h));
  if(!principalControls)continue;
  const source={kind:'mandate',id:m.id,source:m.id,principal:m.creditor,scope:structuredClone(m.terms?.scope??[]),version:digest(m)};
  if(scoped(m.terms?.scope,op,subject)||op==='consent'&&consentScope&&(scoped(m.terms?.scope,consentScope,subject)||consentScope==='mandate'&&m.terms?.subdelegate===true))sources.push(source);
  else if(!legal&&subject===m.creditor&&m.terms?.scope?.length)excess.push({...source,tags:['ultra_vires']});
 }
 // Trusted composition-root provider covers law/charter/motions/recognition.
 // It returns current derived facts; proposal fields never become this input.
 for(const source of context.authoritySources?.({actor,op,target:subject,kind,variant,holding,holder,reason,effect,until,document:context.document})??[])if(source?.id&&source.allowed===true&&!(source.kind==='theft'&&sources.length)){sources.push({...source});tags.push(...source.tags??[]);}
 if(legal&&op==='holding.close'&&actor===holding?.holder){
  const proof=context.movementAuthority?.({actor,to:null,custody:holding,document:context.document});
  if(reason==='escaped'&&proof?.allowed===true&&proof.kind==='escape'&&proof.source){const source={kind:'escape',id:proof.source};return {allowed:true,sources:[source],tags:['escaped'],actedAs:source,reason:null};}
  return {allowed:false,sources:[],tags:[],actedAs:null,reason:'Must escape through an adjudicated escape action'};
 }
 // An existing office/mandate may exceed its civil powers, but cannot mint
 // new issuing rights, release legal custody or cross into another principal.
 if(!sources.length&&['transfer','holding.transfer','fact.set','destroy','move','obligation.create','obligation.settle','obligation.cancel'].includes(op)){
  sources.push(...excess);if(excess.length)tags.push('ultra_vires');
 }
 for(const source of sources){
  const row=context.document.holdings?.rows?.[source.id];
  if(row&&!source.version)source.version=digest(row);
 }
 if(sources.length){
  if(op==='holding.rescale'){
   const held=aliveHoldings(d,{kind,subject}),holders=new Set([...held.map(h=>h.holder),...Object.keys(shares??{})]);
   for(const holder of [...holders].filter(holder=>holder!==actor&&(shares?.[holder]??0)!==(held.find(h=>h.holder===holder)?.terms?.share??0))){
    const consent=context.rescaleConsent?.({document:context.document,actor,holder,subject,shares});
    if(!consent?.allowed||!consent.source)return {allowed:false,sources,tags,actedAs:null,reason:'Affected holders have not consented to rescaling'};
   }
  }
  return {allowed:true,sources,tags,actedAs:sources[0],reason:null};
 }
 if(disposition&&possessor(context,subject)===actor)return {allowed:true,sources:[{kind:'possession',id:subject}],tags:['unauthorized_disposition'],actedAs:null,reason:'无权处分，效力待依法判断'};
 return {allowed:false,sources,tags,actedAs:null,reason:disposition?'东西不在你手上':'你没有对该标的行使此项权能的依据'};
}

// L1 composition adapter. Context and options come from native engine code;
// proposal JSON supplies only effects. mirrorTransfer is mandatory while the
// migration still has legacy resource projections.
export function createActionPrimitiveFrame(context,{actor,eventId,source,mirrorTransfer,transferLot=null,factPolicy={},verbs=[],createDraft=null,executePrimitive=null,accountExists=null,validate=null,validateFact=null,prepare=null,finish=null,identity=null,consequence=null}){
 const withDocument=document=>({...context,document});
 const destination=(document,effect)=>{
  if(effect.op!=='move')return effect.to;
  if(effect.to==='player')return document.state?.location;
  return actionEntity(withDocument(document),effect.to)?.location??context.engine?.world.locations.find(l=>l.features?.some(f=>f.id===effect.to))?.id??effect.to;
 };
  return createPrimitiveFrame({actor,eventId,source,mirrorTransfer,transferLot,factPolicy,verbs,createDraft,executePrimitive,engine:context.engine,accountExists,validateFact,prepare,finish,identity,
  validate:document=>{validate?.(document);if(capacity(withDocument(document),actor,'action').level==='none')reject('E-CAPACITY','The actor cannot currently initiate an action');},
  canAct:(document,id,family,effect)=>{
   const permission=canAct(withDocument(document),id,family==='time'?'wait':family==='emit'&&['tell','request','claim','consent_given','consent_revoked'].includes(effect.verb)?'talk':family,{to:destination(document,effect),closing:family==='holding.close'?effect:null});
   // Native staged programs can finish their already-triggered failure after
   // losing capacity during prepare. validate above still gates the initiative.
   return !permission.allowed&&consequence?.(document,effect)===true?{allowed:true,tags:[]}:permission;
  },
  authority:(document,id,op,target,options)=>authority(withDocument(document),id,op,target,options),
  location:(document,id)=>located(actionReader(document),id,x=>x==='player'?document.state?.location:actionEntity(withDocument(document),x)?.location??context.engine?.byId?.get(x)?.location??null)});
}
