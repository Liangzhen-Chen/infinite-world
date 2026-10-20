// A3-B native service. The engine/HTTP composition root owns public dispatch.
import {routeAction} from './action-router.mjs';
import {limitOpenEffects} from './action-limits.mjs';
import {primitiveRuntime} from './primitives-runtime.mjs';
import {reject} from './primitive-policy.mjs';

export function prepareOpenAction(engine,document,proposal,native){
 if(!proposal||typeof proposal.intent!=='string'||!proposal.intent.trim())reject('E-OPEN-INTENT','请说明你想做什么');
 const registry=primitiveRuntime.registry(engine),routing=routeAction(proposal,registry,native.routing);
 if(routing.needsSlots)return {...routing,status:'needs_slots',effects:[],cost:null};
 if(routing.routed)return {...routing,status:'routed',slots:routing.candidates[0].slots,effects:[],cost:null};
 const limits=limitOpenEffects(proposal,native.limits(document,routing.nearest));
 return {...routing,...limits,status:limits.blocked.length?'needs_alternative':'open',fallback:limits.blocked.length?{action:'open:leave_mark',intent:proposal.intent,available:false}:null};
}

// Real registered execution: the proposal never carries its own outcomes,
// numerical cost, consent, check or theft permission into this branch.
// Unmatched execution is deliberately not reported as applied: A3-A must attach
// this prepared plan to an open-source frame at its transaction boundary.
export async function executeRoutedOpenAction(engine,document,input,native,{preview=false}={}){
 const prepared=prepareOpenAction(engine,document,input.args,native);
 if(prepared.status!=='routed')return {prepared,receipt:{eventId:input.eventId,applied:[],status:'not_submitted'}};
 const actionInput={tool:'world_act',eventId:input.eventId,args:{action:prepared.routed,slots:prepared.slots}};
 const result=preview?await engine.previewAction(document,actionInput):await engine.reduce(document,actionInput);
 return {...result,routing:prepared};
}
