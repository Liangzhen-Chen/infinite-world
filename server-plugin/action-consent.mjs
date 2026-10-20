import {capacity} from './action-capacity.mjs';
import {authority} from './action-authority.mjs';

// events are persisted, engine-observed consent facts, not a proposal's args.
export function consent(context,from,to,scope,{purpose=null,until=context.document.state?.minute??0,onRefusal='contest'}={}){
 const now=context.document.state?.minute??0,level=capacity(context,from,scope).level;
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
 const emergency=context.emergencyConsent?.({from,to,scope,purpose,until});
 if(emergency?.allowed&&emergency.source)return result('emergency',emergency.source);
 // NPC decision adapter returns the observed A2 decision with a provenance id.
 if(!needsProxy){const decision=context.consentDecision?.({from,to,scope,purpose,until});if(decision?.decision==='agree'&&decision.source)return result('given',decision.source);}
 return {allowed:false,kind:'none',source:null,check:onRefusal==='abort'?'abort':'contest',tags:purposeMismatch?['unconsented','unconsented:purpose']:['unconsented'],reason:'没有覆盖本次用途与期限的有效同意'};
}
