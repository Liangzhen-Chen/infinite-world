import {aliveHoldings,holdingKind,locationOf,located} from './holdings.mjs';
import {effective} from './holding-kinds.mjs';
import {parseAccount} from './ledger.mjs';
import {obligationRows,obligationClosed} from './obligation-state.mjs';
import {actionEntity,actionReader,capacity,canAct} from './action-capacity.mjs';
import {createPrimitiveFrame} from './primitives.mjs';

const scoped=(scope,op,target)=>Array.isArray(scope)&&scope.some(s=>typeof s==='string'?s===op:s?.op===op&&(s.target===undefined||s.target===target));
export function possessor(context,target){
 const d=actionReader(context.document),seen=new Set();let id=target;
 while(id&&!seen.has(id)){seen.add(id);const loc=locationOf(d,id);if(!loc)break;
  if(loc.mode==='carried')return loc.at;
  const operator=aliveHoldings(d,{kind:'operates',subject:loc.at}).find(h=>effective(d,h.id));
  if(operator)return operator.holder;id=loc.at;
 }return null;
}
export function authority(context,actor,op,target,{disposition=false,consentScope=null}={}){
 const d=actionReader(context.document),sources=[],tags=[];let account=null;
 if(typeof target==='string'&&target.includes('|'))account=parseAccount(target);
 // Protected purpose is never an ordinary possession/office exception.
 if(account&&/^(escrow:|collected:)/.test(account.purpose))return {allowed:false,sources,tags,actedAs:null,reason:'托管用途只能由对应义务清偿、解缴或判决动用'};
 const subject=account?.owner??target;
 if(!actionEntity(context,actor)||capacity(context,actor,op).level==='none')return {allowed:false,sources,tags,actedAs:null,reason:'行动者当前不能行使权能'};
 if(subject===actor)sources.push({kind:'self',id:actor});
 const holdings=aliveHoldings(d,{holder:actor});
 const usable=h=>effective(d,h.id,{alive:id=>capacity(context,id,op).level!=='none',impaired:id=>capacity(context,id,op).level==='none'});
 for(const h of holdings){
  if(!usable(h))continue;
  const kind=holdingKind(h.kind),powers=h.terms?.authority??kind?.derives?.authority;
  const guardian=h.kind==='guardian_of'&&(op!=='consent'||h.terms?.scope!=='property_only'||['property','transfer'].includes(consentScope));
  if(h.subject===subject&&((['owns','operates'].includes(h.kind)||guardian)&&['transfer','holding.transfer','holding.open','fact.set','consent'].includes(op)||scoped(powers,op,subject)))sources.push({kind:h.kind,id:h.id,subject:h.subject});
  else if(scoped(powers,op,subject))sources.push({kind:h.kind,id:h.id,subject:h.subject});
 }
 const now=context.document.state?.minute??0;
 const mandates=obligationRows(context.document.state??{}).filter(o=>(o.kind??o.obligationKind)==='mandate'&&o.debtor===actor&&!obligationClosed(o)&&(o.until===undefined||o.until>now)&&(o.since===undefined||o.since<=now)&&!o.revoked);
 for(const m of mandates)if(scoped(m.terms?.scope,op,subject)||op==='consent'&&consentScope&&scoped(m.terms?.scope,consentScope,subject))sources.push({kind:'mandate',id:m.id,principal:m.creditor});
 // Trusted composition-root provider covers law/charter/motions/recognition.
 // It returns current derived facts; proposal fields never become this input.
 for(const source of context.authoritySources?.({actor,op,target:subject})??[])if(source?.id&&source.allowed===true)sources.push({...source});
 if(sources.length)return {allowed:true,sources,tags,actedAs:sources[0],reason:null};
 if(disposition&&possessor(context,subject)===actor)return {allowed:true,sources:[{kind:'possession',id:subject}],tags:['unauthorized_disposition'],actedAs:null,reason:'无权处分，效力待依法判断'};
 return {allowed:false,sources,tags,actedAs:null,reason:disposition?'东西不在你手上':'你没有对该标的行使此项权能的依据'};
}

// L1 composition adapter. Context and options come from native engine code;
// proposal JSON supplies only effects. mirrorTransfer is mandatory while the
// migration still has legacy resource projections.
export function createActionPrimitiveFrame(context,{actor,eventId,source,mirrorTransfer,factPolicy={},verbs=[]}){
 const withDocument=document=>({...context,document});
 return createPrimitiveFrame({actor,eventId,source,mirrorTransfer,factPolicy,verbs,
  canAct:(document,id,family,effect)=>canAct(withDocument(document),id,family==='emit'&&['tell','request','claim'].includes(effect.verb)?'talk':family,{to:effect.to}),
  authority:(document,id,op,target,options)=>authority(withDocument(document),id,op,target,options),
  location:(document,id)=>located(actionReader(document),id,x=>x==='player'?document.state?.location:actionEntity(withDocument(document),x)?.location??context.engine?.byId?.get(x)?.location??null)});
}
