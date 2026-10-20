// A3-B native service. The engine/HTTP composition root owns public dispatch.
import {routeAction,createRoutingContext,resolveProposalEntities} from './action-router.mjs';
import {limitOpenEffects,deriveOpenLimits} from './action-limits.mjs';
import {primitiveRuntime} from './primitives-runtime.mjs';
import {reject} from './primitive-policy.mjs';
import {executeLeaveMark} from './mark-actions.mjs';
import {executeRite} from './action-rite.mjs';

export function prepareOpenAction(engine,document,proposal,native){
 if(!proposal||typeof proposal.intent!=='string'||!proposal.intent.trim())reject('E-OPEN-INTENT','请说明你想做什么');
 native??=createOpenActionContext(engine,document,proposal);
 if(typeof native.routing.resolve==='function'){
  const entities=resolveProposalEntities(proposal,native.routing);
  if(entities.ambiguities.length)return {status:'needs_entities',...entities,effects:[],cost:null,candidates:[],routed:null};
  proposal=entities.proposal;
 }
 const registry=primitiveRuntime.registry(engine),routing=routeAction(proposal,registry,native.routing);
 if(routing.needsSlots)return {...routing,status:'needs_slots',effects:[],cost:null};
 if(routing.routed)return {...routing,status:'routed',slots:routing.candidates[0].slots,effects:[],cost:null};
 const limits=limitOpenEffects(proposal,native.limits(document,routing.nearest));
 return {...routing,...limits,status:limits.blocked.length?'needs_alternative':'open',fallback:limits.blocked.length?{action:'open:leave_mark',intent:proposal.intent,available:Boolean(engine.world.openActionRules&&engine.world.openReactions&&engine.world.openTagging)}:null};
}

export function createOpenActionContext(engine,document,proposal,{actor='player'}={}){
 const routing=createRoutingContext(engine,document,{actor});
 return {routing,limits:(current,nearest)=>{
  const fresh=createRoutingContext(engine,current,{actor}),resolved=resolveProposalEntities(proposal,fresh);
  if(resolved.ambiguities.length)reject('E-OPEN-ENTITY','对象已经离开或不再可见');
  return deriveOpenLimits(engine,current,resolved.proposal,nearest,{actor,routing:fresh});
 }};
}

// Real registered execution: the proposal never carries its own outcomes,
// numerical cost, consent, check or theft permission into this branch.
// Unmatched execution is deliberately not reported as applied: A3-A must attach
// this prepared plan to an open-source frame at its transaction boundary.
export async function executeRoutedOpenAction(engine,document,input,native,{preview=false}={}){
 const prepared=prepareOpenAction(engine,document,input.args,native);
 if(prepared.status!=='routed')return {prepared,receipt:{eventId:input.eventId,applied:[],status:'not_submitted'}};
 if(prepared.routed==='open:leave_mark'){
  const result=executeLeaveMark(engine,document,{eventId:input.eventId,args:{slots:prepared.slots}},{preview,actor:native?.routing?.actor??'player'});
  return {...result,result:{action:prepared.routed,receipt:result.receipt},routing:prepared};
 }
 const action=primitiveRuntime.registry(engine).byId.get(prepared.routed);
 if(action?.rite){
  const result=executeRite(engine,document,{eventId:input.eventId,args:{action:prepared.routed,slots:prepared.slots}},{preview,actor:native?.routing?.actor??'player'});
  return {...result,result:{action:prepared.routed,receipt:result.receipt},routing:prepared};
 }
 const actionInput={tool:'world_act',eventId:input.eventId,args:{action:prepared.routed,slots:prepared.slots}};
 const result=preview?await engine.previewAction(document,actionInput):await engine.reduce(document,actionInput);
 return {...result,routing:prepared};
}
