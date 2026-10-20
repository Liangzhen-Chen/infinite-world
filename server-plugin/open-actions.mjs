// A3-B native service. The engine/HTTP composition root owns public dispatch.
import {routeAction,createRoutingContext,resolveProposalEntities} from './action-router.mjs';
import {limitOpenEffects,deriveOpenLimits} from './action-limits.mjs';
import {primitiveRuntime} from './primitives-runtime.mjs';
import {reject,writableFactField} from './primitive-policy.mjs';
import {executeLeaveMark} from './mark-actions.mjs';
import {executeRite} from './action-rite.mjs';
import {resolvePrimitiveTransfer} from './primitive-accounts.mjs';
import {applyPatches,digest} from './storage.mjs';
import {obligationRows,obligationClosed} from './obligation-state.mjs';
import {parseAccount,LEDGER_COIN} from './ledger.mjs';

// These are compositions of existing domain programs. No proposed transfer,
// nutrition or settlement is executed directly by the composition itself.
function prepareOpenSequence(proposal,registry,context){
 const effects=proposal.effects??[],actor=context.actor??'player',owner=value=>typeof value==='string'&&value.includes('|')?parseAccount(value).owner:value;
 const resource=e=>e.resource??(typeof e.from==='string'&&e.from.includes('|')?parseAccount(e.from).resource:null),coin=e=>['coin',LEDGER_COIN].includes(resource(e));
 const find=predicate=>registry.actions.find(predicate)?.id;
 if(effects.length===4){
  const [payment,goods,consume,nutrition]=effects;
  if(payment.op==='transfer'&&coin(payment)&&owner(payment.from)===actor&&goods.op==='transfer'&&owner(goods.to)===actor&&owner(goods.from)===owner(payment.to)&&consume.op==='transfer'&&owner(consume.from)===actor&&owner(consume.to)==='sink:consume'&&consume.qty===1&&resource(consume)===resource(goods)&&nutrition.op==='vital'&&nutrition.target===actor&&nutrition.type==='body:satiety'){
   const buy=routeAction({...proposal,effects:[payment,goods]},registry,context),meal=find(a=>a.call?.tool==='world_remember'&&a.call.fixed?.key==='dialogue:eat_meal');
   if(buy.routed&&meal)return {status:'sequence',routed:'open:proposal',signature:buy.signature,candidates:buy.candidates,effects:[],cost:null,steps:[{action:buy.routed,slots:buy.candidates[0].slots},{action:meal,slots:{item:resource(goods)}}]};
  }
 }
 if(effects.length>=4&&effects.length%2===0){
  const steps=[];
  for(let i=0;i<effects.length;i+=2){
   const transfer=effects[i],settlement=effects[i+1],from=owner(transfer.from),to=owner(transfer.to);
   if(transfer.op!=='transfer'||!coin(transfer)||settlement.op!=='obligation.settle'||settlement.amount!==transfer.qty||from!==actor&&to!==actor)return null;
   const incoming=to===actor,action=find(a=>a.call?.tool==='world_trade'&&(incoming?a.call.operation==='collect':a.call.fixed?.payment==='repay'));
   if(!action)return null;
   steps.push({action,slots:{seller:incoming?from:to,coins:transfer.qty},debtReference:{id:settlement.id,debtor:from,creditor:to,amount:transfer.qty}});
  }
  return {status:'sequence',routed:'open:proposal',signature:[],candidates:[],effects:[],cost:null,steps};
 }
 return null;
}

export async function executeOpenSequence(engine,document,input,prepared,{preview=false}={}){
 let current=document;const patches=[],receipts=[];
 for(const [index,step] of prepared.steps.entries()){
  const slots={...step.slots};
  if(step.debtReference){
   const ref=step.debtReference,rows=obligationRows(current.state).filter(row=>!obligationClosed(row)&&row.debtor===ref.debtor&&row.creditor===ref.creditor&&(row.amount??row.principal??row.terms?.principal??0)-(row.paid??0)>=ref.amount);
   const exact=rows.find(row=>row.id===ref.id||row.legacyRecord===ref.id),matches=exact?[exact]:/^[a-z][a-z0-9_:.-]*$/i.test(ref.id??'')?[]:rows;
   if(matches.length!==1)reject('E-OPEN-OBLIGATION',matches.length?'有多笔符合条件的债务，请指定实际债据编号':'没有符合收付款双方及金额的未结债务');
   slots.debt=matches[0].legacyRecord??matches[0].id;
  }
  const call={tool:'world_act',eventId:`${input.eventId.slice(0,88)}:step:${index}:${digest({eventId:input.eventId,args:input.args}).slice(0,8)}`,args:{action:step.action,slots}};
  const reduced=await engine.reduce(current,call),receipt=reduced.result.receipt??primitiveRuntime.legacyPreview(engine,current,call,primitiveRuntime.resolve(engine,call),reduced);
  current=applyPatches(current,reduced.patches);patches.push(...reduced.patches);receipts.push({...receipt,status:'committed'});
 }
 const receipt={eventId:input.eventId,actor:'player',source:{kind:'open',id:'open:proposal'},routed:'open:proposal',status:preview?'preview':'committed',applied:receipts.flatMap(r=>r.applied??[]),cost:{time:current.state.minute-document.state.minute,resources:receipts.flatMap(r=>r.cost?.resources??[])},steps:receipts,routing:prepared};
 return preview?{receipt,routing:prepared}:{patches,result:{action:'open:proposal',receipt}};
}

export function prepareOpenAction(engine,document,proposal,native){
 if(!proposal||typeof proposal.intent!=='string'||!proposal.intent.trim())reject('E-OPEN-INTENT','请说明你想做什么');
 for(const effect of proposal.effects??[]){
  if(effect.op==='fact.set')writableFactField(effect.field);
  if(effect.tags!==undefined&&(!Array.isArray(effect.tags)||effect.tags.length>0)&&!(effect.op==='create'&&effect.kind==='mark'))reject('E-PRIMITIVE-SOURCE','原语不能自报 tags');
 }
 if(proposal.consent&&Object.hasOwn(proposal.consent,'granted'))reject('E-OPEN-CONSENT','同意须读取真实事件，不能由提案代填');
 native??=createOpenActionContext(engine,document,proposal);
 if(typeof native.routing.resolve==='function'){
  const entities=resolveProposalEntities(proposal,native.routing);
  if(entities.ambiguities.length)return {status:'needs_entities',...entities,effects:[],cost:null,candidates:[],routed:null};
  proposal=entities.proposal;
 }
 const registry=primitiveRuntime.registry(engine),sequence=prepareOpenSequence(proposal,registry,native.routing);
 if(sequence)return sequence;
 const routing=routeAction(proposal,registry,native.routing);
 if(routing.needsSlots)return {...routing,status:'needs_slots',effects:[],cost:null};
 if(routing.routed)return {...routing,status:'routed',slots:routing.candidates[0].slots,effects:[],cost:null};
 // Only the unmatched primitive path consumes the proposal's accounts. A
 // registered program owns its own endpoints, consent, stock and cost checks.
 proposal={...proposal,effects:proposal.effects.map(effect=>resolvePrimitiveTransfer(engine,document,effect,{actor:native.routing.actor}))};
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
  const normalized={...resolved.proposal,effects:resolved.proposal.effects.map(effect=>resolvePrimitiveTransfer(engine,current,effect,{actor}))};
  return deriveOpenLimits(engine,current,normalized,nearest,{actor,routing:fresh});
 }};
}

// Real registered execution: the proposal never carries its own outcomes,
// numerical cost, consent, check or theft permission into this branch.
// Unmatched execution is deliberately not reported as applied: A3-A must attach
// this prepared plan to an open-source frame at its transaction boundary.
export async function executeRoutedOpenAction(engine,document,input,native,{preview=false}={}){
 const prepared=prepareOpenAction(engine,document,input.args,native);
 if(prepared.status==='sequence')return {...await executeOpenSequence(engine,document,input,prepared,{preview}),routing:prepared};
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
