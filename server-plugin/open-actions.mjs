// A3-B native service. The engine/HTTP composition root owns public dispatch.
import {routeAction,createRoutingContext,resolveProposalEntities} from './action-router.mjs';
import {limitOpenEffects,deriveOpenLimits} from './action-limits.mjs';
import {primitiveRuntime} from './primitives-runtime.mjs';
import {reject,writableFactField} from './primitive-policy.mjs';
import {executeLeaveMark} from './mark-actions.mjs';
import {executeRite} from './action-rite.mjs';

export function prepareOpenAction(engine,document,proposal,native){
 if(!proposal||typeof proposal.intent!=='string'||!proposal.intent.trim())reject('E-OPEN-INTENT','请说明你想做什么');
 for(const effect of proposal.effects??[]){
  if(effect.op==='fact.set')writableFactField(effect.field);
  if(effect.tags!==undefined&&(!Array.isArray(effect.tags)||effect.tags.length>0)&&!(effect.op==='create'&&effect.kind==='mark'))reject('E-PRIMITIVE-SOURCE','原语不能自报 tags');
 }
 if(proposal.consent&&Object.hasOwn(proposal.consent,'granted'))reject('E-OPEN-CONSENT','同意须读取真实事件，不能由提案代填');
 native??=createOpenActionContext(engine,document,proposal);
 if(typeof native.routing.resolve==='function'){
  const entities=resolveProposalEntities(proposal,native.routing,{accounts:true});
  if(entities.ambiguities.length)return {status:'needs_entities',...entities,effects:[],cost:null,candidates:[],routed:null};
  proposal=entities.proposal;
 }
 const registry=primitiveRuntime.registry(engine),routing=routeAction(proposal,registry,native.routing);
 if(routing.needsSlots)return {...routing,status:'needs_slots',effects:[],cost:null};
 if(routing.routed)return {...routing,status:'routed',slots:routing.candidates[0].slots,effects:[],cost:null};
 for(const effect of proposal.effects??[]){
  if(effect.op==='move'&&effect.mode==='teleport')reject('E-OPEN-MOVE','普通搬动不能隔空取物，请先靠近或使用真实的传送来源');
  if(effect.op==='obligation.create'&&effect.obligationKind==='loan')reject('E-OPEN-OBLIGATION','借款须先取得真实同意并通过贷款或债务登记动作');
  if(effect.op==='learn')reject('E-OPEN-LEARN','学习须通过真实的授课、读书或练习动作校验来源与能力');
 }
 const limits=limitOpenEffects(proposal,native.limits(document,routing.nearest));
 const alternative=limits.blocked.length>0||limits.effects.length===0;
 return {...routing,...limits,status:alternative?'needs_alternative':'open',fallback:alternative?{action:'open:leave_mark',intent:proposal.intent,available:Boolean(engine.world.openActionRules&&engine.world.openReactions&&engine.world.openTagging),...(!limits.effects.length&&!limits.blocked.length?{reason:'当前收益或工作量已达上限，可以换一种手段，或留下痕迹'}:{})}:null};
}

export function createOpenActionContext(engine,document,proposal,{actor='player'}={}){
 const routing=createRoutingContext(engine,document,{actor});
 return {routing,limits:(current,nearest)=>{
  const fresh=createRoutingContext(engine,current,{actor}),resolved=resolveProposalEntities(proposal,fresh,{accounts:true});
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
