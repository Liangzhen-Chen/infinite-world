import {aliveHoldings,holdingKind,locationOf,located} from './holdings.mjs';
import {effective} from './holding-kinds.mjs';
import {parseAccount} from './ledger.mjs';
import {obligationRows,obligationClosed} from './obligation-state.mjs';
import {actionEntity,actionReader,capacity,canAct} from './action-capacity.mjs';
import {createPrimitiveFrame} from './primitives.mjs';
import {digest} from './storage.mjs';
import {reject} from './primitive-policy.mjs';

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
export function createActionPrimitiveFrame(context,{actor,eventId,source,mirrorTransfer,factPolicy={},verbs=[],createDraft=null,executePrimitive=null,accountExists=null,validate=null,validateFact=null,prepare=null,finish=null,identity=null}){
 const withDocument=document=>({...context,document});
 const destination=(document,effect)=>{
  if(effect.op!=='move')return effect.to;
  if(effect.to==='player')return document.state?.location;
  return actionEntity(withDocument(document),effect.to)?.location??context.engine?.world.locations.find(l=>l.features?.some(f=>f.id===effect.to))?.id??effect.to;
 };
 return createPrimitiveFrame({actor,eventId,source,mirrorTransfer,factPolicy,verbs,createDraft,executePrimitive,engine:context.engine,accountExists,validateFact,prepare,finish,identity,
  validate:document=>{validate?.(document);if(capacity(withDocument(document),actor,'action').level==='none')reject('E-CAPACITY','The actor cannot currently initiate an action');},
  canAct:(document,id,family,effect)=>canAct(withDocument(document),id,family==='time'?'wait':family==='emit'&&['tell','request','claim','consent_given','consent_revoked'].includes(effect.verb)?'talk':family,{to:destination(document,effect),closing:family==='holding.close'?effect:null}),
  authority:(document,id,op,target,options)=>authority(withDocument(document),id,op,target,options),
  location:(document,id)=>located(actionReader(document),id,x=>x==='player'?document.state?.location:actionEntity(withDocument(document),x)?.location??context.engine?.byId?.get(x)?.location??null)});
}
