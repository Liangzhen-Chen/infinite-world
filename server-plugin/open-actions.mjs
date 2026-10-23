// A3-B native service. The engine/HTTP composition root owns public dispatch.
import {routeAction,createRoutingContext,resolveProposalEntities} from './action-router.mjs';
import {limitOpenEffects,deriveOpenLimits} from './action-limits.mjs';
import {primitiveRuntime,primitiveContext} from './primitives-runtime.mjs';
import {canAct} from './action-capacity.mjs';
import {authority} from './action-authority.mjs';
import {reject,writableFactField} from './primitive-policy.mjs';
import {executeLeaveMark} from './mark-actions.mjs';
import {executeRite} from './action-rite.mjs';
import {resolvePrimitiveTransfer} from './primitive-accounts.mjs';
import {applyPatches,digest} from './storage.mjs';
import {obligationRows,obligationClosed} from './obligation-state.mjs';
import {parseAccount,LEDGER_COIN} from './ledger.mjs';
import {resolveTimeSlot} from './action-time.mjs';
import {refusalProjection} from './action-rejection.mjs';
import {markFallback,actionBoundary} from './action-boundary.mjs';

// Scheduling a question records the player's own future request. The authored
// question program rechecks presence when due and grants no NPC commitment.
function scheduledQuestion(engine,document,proposal,context){
 if(proposal.effects?.length!==1)return proposal;
 const effect=proposal.effects[0];if(effect.op!=='schedule'||effect.action!=='core:dialogue.ask')return proposal;
 const args=effect.args??{},target=context.resolve(args.subject??args.target??proposal.target).value;
 if(!target||context.kindOf(target)!=='person')reject('E-OPEN-SCHEDULE','预约询问须指定真实的在场交谈对象');
 if(args.actor!==undefined&&context.resolve(args.actor).value!==context.actor)reject('E-OPEN-SCHEDULE','不能替他人预约行动');
 if(args.source!==undefined)reject('E-OPEN-SCHEDULE','带赠礼的询问请在届时通过真实交谈动作办理');
 const content=args.content??args.topic;if(typeof content!=='string'||!content.trim())reject('E-OPEN-SCHEDULE','请说明届时要问的内容');
 // A relative time resolves only through the archived time-slot table.
 const at=resolveTimeSlot(engine,document,effect.at,{location:context.actor==='player'?document.state.location:document.state.npcs?.[context.actor]?.location});
 if(!Number.isSafeInteger(at)||at<=document.state.minute)reject('E-SCHEDULE-TIME','请指定一个未来的明确时刻');
 return {...proposal,effects:[{op:'schedule',at,action:'open:question',args:{target,content}},{op:'emit',verb:'tell',actor:context.actor,target,visibility:'witnessed',payload:{kind:'question_scheduled',at,content}}]};
}

// These are compositions of existing domain programs. No proposed transfer,
// nutrition or settlement is executed directly by the composition itself.
function prepareOpenSequence(proposal,registry,context,engine){
 const effects=proposal.effects??[],actor=context.actor??'player',owner=value=>typeof value==='string'&&value.includes('|')?parseAccount(value).owner:value;
 const resource=e=>e.resource??(typeof e.from==='string'&&e.from.includes('|')?parseAccount(e.from).resource:null),coin=e=>['coin',LEDGER_COIN].includes(resource(e));
 const find=predicate=>registry.actions.find(predicate)?.id;
 // Known environment spells run their native programs in order. The second
 // cast sees the first cast's staged water, pays its own MP/time, and a failed
 // prerequisite discards the whole staged sequence (06 §6.3 / §6.7).
 if(effects.length===2&&Array.isArray(proposal.means?.spells)&&proposal.means.spells.length===2){
  const [water,clean]=effects,spells=proposal.means.spells.map(id=>context.resolve(id,'spell').value),cast=find(a=>a.call?.tool==='world_cast');
  if(cast&&water.op==='transfer'&&water.resource==='water'&&clean.op==='fact.set'&&clean.entity===water.to&&clean.field==='turbidity'&&clean.delta<0){
   const source=engine.byId.get(spells[0]),purifier=engine.byId.get(spells[1]);
   if(source?.effectSpec?.operation==='irrigate'&&purifier?.effectSpec?.operation==='clean_water')return {status:'sequence',routed:'open:proposal',signature:[],candidates:[],effects:[],cost:null,steps:[{action:cast,slots:{spell:spells[0],source:water.from,target:water.to,millilitres:water.qty*1000}},{action:cast,slots:{spell:spells[1],target:water.to}}]};
  }
 }
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

function rejectOpenSequence(engine,document,input,prepared,receipt,index,preview){
 const routing={...prepared,...receipt.routing,status:'sequence',intent:input.args.intent,proposal:structuredClone(input.args),failedStep:index,steps:prepared.steps};
 const rejected={...receipt,eventId:input.eventId,routing};
 return actionBoundary(engine,document,{...input,tool:'world_propose'},async()=>preview?{receipt:rejected,routing}:{patches:[],result:{ok:false,action:'open:proposal',receipt:rejected}},{preview});
}

export async function executeOpenSequence(engine,document,input,prepared,{preview=false}={}){
 let current=document,failedStep=null;const patches=[],receipts=[];
 for(const [index,step] of prepared.steps.entries()){
  const slots={...step.slots};
  if(step.debtReference){
   const ref=step.debtReference,rows=obligationRows(current.state).filter(row=>!obligationClosed(row)&&row.debtor===ref.debtor&&row.creditor===ref.creditor&&(row.amount??row.principal??row.terms?.principal??0)-(row.paid??0)>=ref.amount);
   const exact=rows.find(row=>row.id===ref.id||row.legacyRecord===ref.id),matches=exact?[exact]:/^[a-z][a-z0-9_:.-]*$/i.test(ref.id??'')?[]:rows;
   if(matches.length!==1){
    const code='E-OPEN-OBLIGATION',reason=matches.length?'有多笔符合条件的债务，请指定实际债据编号':'没有符合收付款双方及金额的未结债务';
    return rejectOpenSequence(engine,document,input,prepared,{eventId:input.eventId,actor:'player',source:{kind:'open',id:'open:proposal'},status:'rejected',code,...refusalProjection({code,reason}),applied:[],events:[],cost:{time:0,resources:[]}},index,preview);
   }
   slots.debt=matches[0].legacyRecord??matches[0].id;
  }
  const call={tool:'world_act',eventId:`${input.eventId.slice(0,88)}:step:${index}:${digest({eventId:input.eventId,args:input.args}).slice(0,8)}`,args:{action:step.action,slots}};
  const reduced=await engine.reduce(current,call,{openProposal:{proposal:input.args,prepared}}),receipt=reduced.result.receipt??primitiveRuntime.legacyPreview(engine,current,call,primitiveRuntime.resolve(engine,call),reduced);
  // Reject the whole sequence, including earlier staged costs and effects.
  if(receipt.status==='rejected'){
   return rejectOpenSequence(engine,document,input,prepared,receipt,index,preview);
  }
  current=applyPatches(current,reduced.patches);patches.push(...reduced.patches);receipts.push({...receipt,status:'committed'});
  // A rolled failure is a performed attempt, not a failed precondition. Keep
  // its native costs and stop dependent steps instead of offering a free retry.
  if(reduced.result.success===false){failedStep=index;break;}
 }
 const applied=[],resources=[];
 for(const [stepIndex,step] of receipts.entries()){
  const byIndex=new Map();
  for(const effect of step.applied??[]){
   const row={...effect,index:applied.length,stepIndex,stepEffectIndex:effect.index};
   applied.push(row);byIndex.set(effect.index,row);
  }
  for(const cost of step.cost?.resources??[]){
   const effect=byIndex.get(cost.index);
   if(!effect)reject('E-ACTION-COST','Sequence cost has no adopted primitive');
   Object.assign(effect,{stepCostIndex:cost.costIndex,costIndex:resources.length});
   resources.push({...cost,index:effect.index,stepIndex,stepEffectIndex:cost.index,stepCostIndex:cost.costIndex,costIndex:effect.costIndex});
  }
 }
 const routing=failedStep===null?prepared:{...prepared,failedStep};
 const receipt={eventId:input.eventId,actor:'player',source:{kind:'open',id:'open:proposal'},routed:'open:proposal',status:preview?'preview':'committed',applied,cost:{time:current.state.minute-document.state.minute,resources},steps:receipts,routing,...(receipts.at(-1)?.status==='rejected'?{reason:receipts.at(-1).reason}:{})};
 return preview?{receipt,routing}:{patches,result:{action:'open:proposal',...(failedStep===null?{}:{success:false,failedStep}),receipt}};
}

export function prepareOpenAction(engine,document,proposal,native){
 const prepared=prepareOpenPlan(engine,document,proposal,native);
 if(!['needs_entities','needs_slots','needs_alternative'].includes(prepared.status))return prepared;
 const missing=prepared.missing??prepared.needsSlots?.missing??prepared.ambiguities?.map(row=>row.path)??prepared.blocked?.map(row=>row.reason);
 const reason=prepared.reason??(prepared.status==='needs_entities'?'尚不能确定你指的是哪个对象，请从已知候选中选择':prepared.status==='needs_slots'?'还缺少完成这项行动所需的选择':'现有手段不能完成原方案的全部效果');
 const alternatives=[];
 for(const row of prepared.ambiguities??[])for(const candidate of row.candidates??[])alternatives.push({kind:'clarify',label:`${row.path}：${candidate.name??candidate.id}`,path:row.path,value:candidate.id,available:false,missing:['选择此对象后仍须重新预览全部条件']});
 for(const candidate of prepared.candidates??[])if(prepared.status==='needs_slots')alternatives.push({action:candidate.id,label:'补全这个候选动作后重新预览',slots:candidate.slots??{},available:false,missing:candidate.missing?.length?candidate.missing:missing?.length?missing:['尚需补全本次行动选择']});
 const fallback=markFallback(engine,document,proposal.intent,{actor:native?.routing?.actor??'player'});
 if(fallback.available&&prepared.fallback?.reason)fallback.reason=`${prepared.fallback.reason}；${fallback.reason}`;
 const details=refusalProjection({reason,missing,alternatives,fallback,repair:prepared.status==='needs_entities'?['从已知候选中明确对象；没有候选时，请提供自己知道的名称或先观察此处。不会替你猜选']:prepared.status==='needs_slots'?[`补全「${(missing??['行动目标']).join('、')}」后重新预览；原方案尚未执行`]:['换用自己实际具备的手段，或把目标分阶段安排后重新预览；没有来源的效果不会发生']});
 return {...prepared,...details};
}

function prepareOpenPlan(engine,document,proposal,native){
 if(!proposal||typeof proposal.intent!=='string'||!proposal.intent.trim())reject('E-OPEN-INTENT','请说明你想做什么');
 for(const effect of proposal.effects??[]){
  if(effect.op==='fact.set')writableFactField(effect.field);
  if(effect.op==='create'&&effect.kind==='project'&&effect.tags?.includes('festival')){
   if(effect.template!=='interim'||!Array.isArray(effect.materials)||effect.materials.length||!effect.facts||Object.keys(effect.facts).some(k=>!['budget','author','location','name'].includes(k))||effect.facts.author!==undefined&&!['self','player'].includes(effect.facts.author))reject('E-PRIMITIVE-SOURCE','节庆构想仅登记本人的预算与拟征询地点，不能代填许可、参与者或投入材料');
  }
  if(effect.tags!==undefined&&(!Array.isArray(effect.tags)||effect.tags.length>0)&&!(effect.op==='create'&&effect.kind==='mark')&&!(effect.op==='create'&&effect.kind==='project'&&Array.isArray(effect.tags)&&effect.tags.length===1&&(proposal.means?.manner==='research'&&effect.tags[0]==='research'||effect.tags[0]==='festival')))reject('E-PRIMITIVE-SOURCE','原语不能自报 tags');
 }
 if(proposal.consent&&Object.hasOwn(proposal.consent,'granted'))reject('E-OPEN-CONSENT','同意须读取真实事件，不能由提案代填');
 native??=createOpenActionContext(engine,document,proposal);
 // Walking cannot release an existing custody holding. Report that native
 // restriction even when the proposed outside destination needs clarification.
 for(const effect of proposal.effects??[])if(effect.op==='move'&&effect.mode==='walk'&&native.routing.resolve?.(effect.entity).value===native.routing.actor){
  const permission=canAct(primitiveContext(engine,document),native.routing.actor,'move',{to:effect.to});
  if(!permission.allowed)reject('E-CAPACITY',permission.reason);
 }
 // A bare teleport move has no source of its own: a real displacement comes from a learned spell (means.spell)
 // routed to its program. Refuse it with its basis before any entity is clarified or resolved.
 if(!proposal.means?.spell)for(const effect of proposal.effects??[])if(effect.op==='move'&&effect.mode==='teleport')reject('E-OPEN-MOVE','普通搬动不能隔空取物，请先靠近或使用真实的传送来源');
 if(typeof native.routing.resolve==='function'){
  const entities=resolveProposalEntities(proposal,native.routing,{deferCombatDestination:true});
  if(entities.ambiguities.length){
   const mark=proposal.effects?.some(effect=>effect.op==='create'&&effect.kind==='mark');
   const onlyMaterials=entities.ambiguities.every(row=>/^effects\.\d+\.(?:resource|materials\.\d+\.(?:resource|item))$/.test(row.path));
   return {status:'needs_entities',...entities,effects:[],cost:null,candidates:[],routed:null,...(mark&&onlyMaterials?{fallback:{action:'open:leave_mark',intent:proposal.intent,available:Boolean(engine.world.openActionRules&&engine.world.openReactions&&engine.world.openTagging),label:'换种形式，留下心意',reason:'材料尚未确认，原物件不会被消耗；可以改用不需要这些材料的形式留下心意'}}:{})};
  }
  proposal=entities.proposal;
 }
 proposal=scheduledQuestion(engine,document,proposal,native.routing);
 // Absolute writes to one field describe the desired final state, not a
 // sequence. Mutually exclusive values need the player's choice (06 §6.10.4).
 const assignments=new Map(),conflicts=[];
 for(const [index,effect] of (proposal.effects??[]).entries())if(effect.op==='fact.set'&&effect.value!==undefined){
  const key=JSON.stringify([effect.entity,effect.field]),previous=assignments.get(key);
  if(previous&&JSON.stringify(previous.value)!==JSON.stringify(effect.value))conflicts.push({entity:effect.entity,field:effect.field,indices:[previous.index,index],values:[previous.value,effect.value]});
  else assignments.set(key,{index,value:effect.value});
 }
 if(conflicts.length)return {status:'needs_slots',routed:null,effects:[],cost:null,candidates:[],missing:['goal'],conflicts,reason:'同一对象的同一属性不能同时取不同的最终值，请选择想要的结果'};
 const registry=primitiveRuntime.registry(engine),sequence=prepareOpenSequence(proposal,registry,native.routing,engine);
 if(sequence)return sequence;
 const routing=routeAction(proposal,registry,native.routing);
 if(routing.needsSlots)return {...routing,status:'needs_slots',effects:[],cost:null};
 if(routing.routed)return {...routing,status:'routed',slots:routing.candidates[0].slots,effects:[],cost:null};
 for(const effect of proposal.effects??[])if(effect.tags!==undefined&&(!Array.isArray(effect.tags)||effect.tags.length>0)&&!(effect.op==='create'&&effect.kind==='mark'))reject('E-PRIMITIVE-SOURCE','原语不能自报 tags');
 // 06 §6.5: an identified person does not determine what to do to them.
 // Scene-only registered actions can still route above. An unresolved goal
 // asks the player and creates no request or NPC commitment.
 if(Array.isArray(proposal.effects)&&proposal.effects.length===0&&native.routing.kindOf?.(proposal.target)==='person')return {...routing,status:'needs_slots',routed:null,effects:[],cost:null,missing:['goal'],reason:'请说明想对目标具体做什么：交谈、治疗、攻击，还是别的事？'};
 if(proposal.effects?.length===0&&proposal.target===undefined)return {...routing,status:'needs_slots',routed:'open:proposal',needsSlots:{action:'open:proposal',missing:['effects']},effects:[],cost:null,missing:['effects'],reason:'此意图尚需具体行动与规则接点；不会按观察结算或预写成功'};
 for(const effect of proposal.effects??[])if(effect.op==='holding.rescale'){
  const permission=authority(primitiveContext(engine,document),native.routing.actor,effect.op,effect.subject,{shares:effect.shares,effect});
  if(!permission.allowed)reject('E-AUTHORITY',permission.reason);
 }
 // An emitted record kind that a registered program produces (catalog
 // signature.emitKind) cannot be claimed by a proposal; it must run that program.
 for(const e of proposal.effects)if(e.op==='emit'&&e.payload?.kind){
  const program=registry.actions.find(a=>a.signature?.emitKind===e.payload.kind);
  if(program)reject('E-OPEN-PROGRAM-OUTPUT',`请通过登记动作「${program.label}」办理：须核对真实主持、参与时窗与实际供品等条件，不能用留痕代替`);
 }
 // Deferred directions belong only to the registered combat program. The
 // unmatched path must still resolve every actual primitive destination.
 if(typeof native.routing.resolve==='function'){
  const strict=resolveProposalEntities(proposal,native.routing);
  if(strict.ambiguities.length)return {status:'needs_entities',...strict,effects:[],cost:null,candidates:routing.candidates,routed:null};
 }
 // Only the unmatched primitive path consumes the proposal's accounts. A
 // registered program owns its own endpoints, consent, stock and cost checks.
 proposal={...proposal,effects:proposal.effects.map(effect=>resolvePrimitiveTransfer(engine,document,effect,{actor:native.routing.actor}))};
 for(const effect of proposal.effects??[]){
  if(effect.op==='move'&&effect.mode==='teleport')reject('E-OPEN-MOVE','普通搬动不能隔空取物，请先靠近或使用真实的传送来源');
  if(effect.op==='obligation.create'&&effect.obligationKind==='loan')reject('E-OPEN-OBLIGATION','借款须先取得真实同意并通过贷款或债务登记动作');
  if(effect.op==='learn')reject('E-OPEN-LEARN','学习须通过真实的授课、读书或练习动作校验来源与能力');
 }
 if(proposal.effects.some(e=>e.op==='create'&&e.kind==='item'&&e.facts?.quality==='crude')){
   const bounds=native.limits(document,routing.nearest,routing.candidates);
  if(!proposal.effects.filter(e=>e.op==='create').every(e=>bounds.improvised?.(e)))reject('E-OPEN-CRAFT','即兴制作须有已掌握的相应手艺、完好工具和同事务投入的自有材料');
 }
 const bounds=native.limits(document,routing.nearest,routing.candidates),limits=limitOpenEffects(proposal,bounds);
 if(limits.blocked.some(row=>{
  const effect=proposal.effects[row.index];
  return effect?.op==='fact.set'&&effect.field==='condition'&&(effect.delta>0||effect.value>bounds.currentValue?.(effect));
 }))reject('E-OPEN-REPAIR','修复需要与材质和规模匹配的技能、工具、材料及工时；请使用修理动作或分阶段工程');
 const alternative=limits.blocked.length>0||limits.effects.length===0;
 return {...routing,...limits,status:alternative?'needs_alternative':'open',fallback:alternative?{action:'open:leave_mark',intent:proposal.intent,available:Boolean(engine.world.openActionRules&&engine.world.openReactions&&engine.world.openTagging),...(!limits.effects.length&&!limits.blocked.length?{reason:'当前收益或工作量已达上限，可以换一种手段，或留下痕迹'}:{})}:null};
}

export function createOpenActionContext(engine,document,proposal,{actor='player'}={}){
 const routing=createRoutingContext(engine,document,{actor});
 return {routing,limits:(current,nearest,candidates=[])=>{
  const fresh=createRoutingContext(engine,current,{actor}),resolved=resolveProposalEntities(proposal,fresh,{accounts:true});
  if(resolved.ambiguities.length)reject('E-OPEN-ENTITY','对象已经离开或不再可见');
  const scheduled=scheduledQuestion(engine,current,resolved.proposal,fresh);
  const normalized={...scheduled,effects:scheduled.effects.map(effect=>resolvePrimitiveTransfer(engine,current,effect,{actor}))};
  const bounds=deriveOpenLimits(engine,current,normalized,nearest,{actor,routing:fresh});
  // An unresolved complete match may execute openly, but cannot obtain a
  // cheaper time cost or a larger reward by selecting one alternative's cap.
  for(const candidate of candidates.filter(c=>c.signatureScore===1&&c.id!==nearest?.id)){
   const other=deriveOpenLimits(engine,current,normalized,candidate,{actor,routing:fresh});
   if(other.nearestCost!==undefined)bounds.nearestCost=Math.max(bounds.nearestCost??0,other.nearestCost);
   for(const [op,fields] of Object.entries(other.nearestBounds))for(const [field,value] of Object.entries(fields)){
    bounds.nearestBounds[op]??={};bounds.nearestBounds[op][field]=Math.min(bounds.nearestBounds[op][field]??value,value);
   }
  }
  return bounds;
 }};
}

// Real registered execution: the proposal never carries its own outcomes,
// numerical cost, consent, check or theft permission into this branch.
// Unmatched execution is deliberately not reported as applied: A3-A must attach
// this prepared plan to an open-source frame at its transaction boundary.
export async function executeRoutedOpenAction(engine,document,input,native,{preview=false}={}){
 return actionBoundary(engine,document,{...input,tool:'world_propose'},()=>executeRoutedPlan(engine,document,input,native,{preview}),{preview});
}
async function executeRoutedPlan(engine,document,input,native,{preview=false}={}){
 const prepared=prepareOpenAction(engine,document,input.args,native);
 if(prepared.status==='sequence')return {...await executeOpenSequence(engine,document,input,prepared,{preview}),routing:prepared};
 if(prepared.status!=='routed')return {prepared,receipt:{eventId:input.eventId,...refusalProjection(prepared),routing:prepared,applied:[],status:'not_submitted'}};
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
