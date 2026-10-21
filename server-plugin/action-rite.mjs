// Native registered rite adapter (13 §13.5). The action program, roles,
// predicates and costs always come from the archived registry, not a proposal.
import {primitiveRuntime,createRuntimePrimitiveFrame,actionEffects} from './primitives-runtime.mjs';
import {commitPrimitives,commitPrimitiveConsequences,recordResourceCosts} from './primitives.mjs';
import {reject} from './primitive-policy.mjs';
import {compileRX,evaluateRX} from './rx.mjs';
import {createRXLibrary} from './rx-library.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {actionEntity,canAct,actionReader} from './action-capacity.mjs';
import {createEntity,updateEntity,declareHoldingWriter,isPhysicallyDead} from './holdings.mjs';
import {accountKey} from './ledger.mjs';
import {digest,recordsWhere} from './storage.mjs';
import {beginBodyActivity,endBodyActivity} from './primitives-body.mjs';
import {consent} from './action-consent.mjs';
import {findAction} from './action-registry.mjs';
import {beginReactionTick} from './world-events.mjs';
import {familyDegree} from './action-degrees.mjs';
import {faithCulture} from './faith-state.mjs';
import {nativePrimitiveTransaction} from './native-primitives.mjs';

declareHoldingWriter('action-rite',{entities:['project']});
const location=(document,id)=>id==='player'?document.state.location:document.state.npcs?.[id]?.location??document.state.creatures?.[id]?.location??document.holdings?.locations?.[id]?.at;
const nonnegative=(n,label)=>{if(!Number.isSafeInteger(n)||n<0)reject('E-RITE-DATA',`${label}须是非负整数`);return n;};
const clone=structuredClone;
const performing=new WeakMap();
const domainSlots=slots=>Object.fromEntries(Object.entries(slots).filter(([key])=>!['project','operation'].includes(key)));
const disruption=error=>['E-RITE-PLACE','E-RITE-ACTOR','E-RITE-QUALIFICATION','E-RITE-DIAGNOSIS','E-RITE-TARGET','E-RITE-ROLE','E-RITE-WINDOW','E-RITE-DISCIPLINE'].includes(error.code);
function disciplineEvidence(engine,document,action,actor){
 const required=action.rite.costs?.discipline;if(required===undefined)return [];
 const labels=Array.isArray(required)?required:[required];
 if(!labels.length||labels.some(t=>typeof t!=='string'||!t))reject('E-RITE-DATA','守戒代价须为标签或标签列表');
 const row=actionEntity({engine,document},actor),tags=new Set([...(engine.byId.get(actor)?.tags??[]),...(row?.tags??[])]);
 const initiations=actor==='player'?Object.values(document.state.careers??{}).map(c=>c.initiation):[];
 return labels.map(label=>{
  if(tags.has(label))return {label,source:`actor:${actor}:tags`};
  const init=initiations.find(i=>i?.rule===label&&i.status==='守戒中'&&i.lastBreach<i.observedSince),record=init&&document.state.records?.[init.record],proof=record&&document.state.records?.[`training_source:${record.sourceEvent}`]?.initiation;
  if(!record||!proof||digest(record)!==digest(proof)||record.rule!==label||record.observedSince!==init.observedSince)reject('E-RITE-DISCIPLINE','主祭尚未持续遵守此仪式要求的戒律');
  return {label,source:init.record,observedSince:init.observedSince};
 });
}
function cultureEffect(engine,document,action,target,actor){
 const culture=action.rite.culture??'any';if(typeof culture!=='string'||!culture)reject('E-RITE-DATA','仪式文化须为文化词或 any');
 const normalize=value=>value?.replace(/^culture:/,'culture_');
 const row=actionEntity({engine,document},target),catalog=engine.byId.get(target),species=engine.byId.get(row?.species??catalog?.species);
 const actual=row?.culture??catalog?.culture??species?.culture??(target==='player'||document.state.npcs?.[target]?faithCulture(engine,document.state,target):null)??engine.byId.get(location(document,target)??location(document,actor))?.culture??null;
 const table=engine.world.openActionRules?.rites?.cultureAffinity;
 const affinity=culture==='any'?1:normalize(actual)===normalize(culture)?table?.same:actual?table?.[culture]?.[actual]??table?.foreign:table?.unknown;
 if(!Number.isFinite(affinity)||affinity<0||affinity>1)reject('E-RITE-DATA','文化亲和系数缺失或无效');
 return {culture,affinity};
}
function vowFor(action,slots,actor,project,eventId,stored){
 return !stored&&action.rite.costs?.vow?[actionEffects({outcomes:{...action.rite.costs.vow,op:'obligation.create',obligationKind:'vow',debtor:actor,id:action.rite.costs.vow.id??`vow_${digest({action:action.id,project:project??eventId}).slice(0,32)}`}},slots,actor)]:[];
}
export function markRiteInterrupted(d,engine,action,{actor,target=actor,project=null,eventId,location:at}){
 const status=action.rite.interrupt?.status;if(status===undefined)return null;
 if(typeof status!=='string'||!status)reject('E-RITE-DATA','中断状态须为状态标签');
 const key=`rite-status:${project??eventId}`;
 const out=nativePrimitiveTransaction(d,{engine,family:'rite:interrupt-status',sourceEvent:eventId,actor,program:{status,target,project,location:at},primitives:[{op:'status',target,status,duration:0,magnitude:1}],
  apply(tx){const row={kind:'rite_status',status,target,project,location:at,source:eventId,action:action.id,since:tx.get('state','minute')};tx.set(['state','effects',key],row);return {effect:key,...row};}});
 return {status,effect:key,source:out.receipt.eventId};
}
function predicate(engine,document,source,{actor,target,candidate=actor,truth=false}={}){
 if(source===undefined)return true;
 if(typeof source!=='string')reject('E-RITE-DATA','仪式条件须是 RX 表达式');
 const library=createRXLibrary(engine,document,{observer:actor}),view=subjectiveView(engine,document,actor);
 library.signatures.believes={args:['string','string'],returns:'boolean'};
 library.functions.believes=(subject,key)=>view.knowledge.facts[`${subject}:${key}`]?.value===true;
 const bindings={actor,target,candidate},schema={actor:'string',target:'string',candidate:'string'};
 if(truth){
  const row=actionEntity({engine,document},target)??{},definition=engine.byId.get(target)??{};
  bindings.truth={tags:[...new Set([...(row.tags??[]),...(definition.truth?.tags??[]),...(row.truth?.tags??[])])],dead:isPhysicallyDead(engine,actionReader(document),target)};
  const tagTypes=['string']; // RX type metadata, not literal ontology tag values.
  schema.truth={tags:tagTypes,dead:'boolean'};
 }
 const compiled=compileRX(source,{schema,functions:library.signatures});
 return evaluateRX(compiled,bindings,{functions:library.functions})===true;
}
function present(engine,document,id,at){
 if(engine.riteSleepingActors?.has(id))return false;
 const body=id==='player'?document.state.player:document.state.npcs?.[id];
 return Boolean(id&&body&&!body.scheduleTravel&&!body.cognitionTravel&&location(document,id)===at&&canAct({engine,document},id,'rite').allowed&&!['濒死','昏迷'].includes(body.status)&&!/(睡眠|熟睡|睡觉)/.test(body.activity??'')&&!isPhysicallyDead(engine,actionReader(document),id));
}
function visibleInputs(engine,document,action,slots,actor,stage,{until=document.state.minute+stage.minutes}={}){
 const rite=action.rite,target=slots.target??actor,at=location(document,actor);
 if(!at)reject('E-RITE-PLACE','主祭必须在实际场所主持仪式');
 if(rite.location&&rite.location!==at)reject('E-RITE-PLACE','这里不是仪式所需的场所');
 if(!present(engine,document,actor,at))reject('E-RITE-ACTOR','主祭此刻无法主持仪式');
 if(!predicate(engine,document,rite.officiant,{actor,target}))reject('E-RITE-QUALIFICATION','主祭尚不具备仪式要求的资格');
 disciplineEvidence(engine,document,action,actor);
 if(!predicate(engine,document,rite.target,{actor,target}))reject('E-RITE-DIAGNOSIS','依你所知，这不是适合该仪式的对象');
 if(target!==actor&&location(document,target)!==at)reject('E-RITE-TARGET','仪式对象已不在这里');
 if(slots.roles!==undefined&&(!slots.roles||typeof slots.roles!=='object'||Array.isArray(slots.roles)||Object.keys(slots.roles).some(name=>!(rite.roles??[]).some(role=>role.role===name))))reject('E-RITE-ROLE','请选择仪式实际声明的角色');
 const people=new Set([actor]);
 for(const role of rite.roles??[]){
  const ids=slots.roles?.[role.role]??[];
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.length<nonnegative(role.min??1,'角色人数')||role.max!==undefined&&ids.length>nonnegative(role.max,'角色人数上限'))reject('E-RITE-ROLE',`缺少或超出仪式角色人数：${role.role}`);
  for(const id of ids){
   if(people.has(id)||!present(engine,document,id,at)||!predicate(engine,document,role.filter,{actor,target,candidate:id}))reject('E-RITE-ROLE',`角色不能履职：${role.role}`);
   if(!consent({engine,document},id,actor,'rite',{purpose:action.id,until,onRefusal:'abort'}).allowed)reject('E-RITE-ROLE',`角色尚未答应参与：${role.role}`);
   people.add(id);
  }
 }
 if(stage.window!==undefined){
  if(['night','day'].includes(stage.window)&&typeof engine.primitiveRiteDaylight!=='function')reject('E-PRIMITIVE-CONNECTOR','仪式昼夜时窗尚缺真实天光接点');
  const daylight=['night','day'].includes(stage.window)?engine.primitiveRiteDaylight(document,at):null;
  const open=stage.window==='night'?daylight===false:stage.window==='day'?daylight===true:typeof stage.window==='object'&&Number.isSafeInteger(stage.window.from)&&Number.isSafeInteger(stage.window.to)&&document.state.minute>=stage.window.from&&document.state.minute<stage.window.to;
  if(!open)reject('E-RITE-WINDOW','尚未到仪式所需的时窗');
 }
 return {target,location:at};
}
function materialsFor(engine,actor,stage){
 return (stage.materials??[]).map(row=>{
  const resource=row.resource??row.item,qty=row.qty??row.amount;
  if(!engine.world.items.some(i=>i.id===resource)||!Number.isSafeInteger(qty)||qty<1)reject('E-RITE-MATERIAL','仪式材料须对应真实物品');
  return {op:'transfer',from:accountKey(actor,resource,'inventory'),to:accountKey('sink:consume',resource,'action'),qty};
 });
}
function gradeEffects(engine,action,slots,actor,degree){
 const baseRow=engine.world.openActionRules?.degrees?.[degree??'成功'];if(!baseRow)reject('E-RITE-DATA','缺少统一的检定档位数据');
 const row={...baseRow,multiplier:familyDegree(engine,'rite',baseRow.key).multiplier??baseRow.multiplier};
 if(!Array.isArray(action.outcomes))return {row,effects:actionEffects({outcomes:action.outcomes?.[row.key]??(row.multiplier? action.outcomes?.success??[]:[])},slots,actor)};
 const base=actionEffects(action,slots,actor);
 if(!row.multiplier)return {row,effects:[]};
 // Holding, obligation, move and other indivisible effects are never halved.
 // A partial result for those effects must be authored explicitly above.
 return {row,effects:row.multiplier===1?base:base.flatMap(effect=>{
  const field=effect.op==='vital'||effect.op==='fact.set'?'delta':effect.op==='learn'?'amount':null;
  return field&&Number.isSafeInteger(effect[field])?[{...effect,[field]:Math.trunc(effect[field]*row.multiplier)}].filter(e=>e[field]!==0):[];
 })};
}

function projectState(engine,document,action,slots,actor,stage,stored,operation='perform',{until}={}){
 const expired=Boolean(stored&&stored.deadline<=document.state.minute);
 let interruption=operation==='interrupt'?'interrupted':expired?'expired':null,facts;
 if(!interruption){
  try{
   facts=visibleInputs(engine,document,action,slots,actor,stage,{until});
   if(stored&&facts.location!==stored.location)interruption='place_changed';
  }catch(error){
   if(!stored||!disruption(error))throw error;
   // A later stage may intentionally require waiting for its own window.
   if(error.code==='E-RITE-WINDOW'&&!(typeof stage.window==='object'&&document.state.minute>=stage.window.to))return {expired,interruption:null,waiting:true};
   interruption=error.code;
  }
 }
 if(interruption)facts={target:slots.target??actor,location:stored.location};
 return {expired,interruption,...facts};
}

// Read-only system input, including projects whose officiant can no longer
// initiate an action. A3-A owns the scheduler and native system-effect frame.
export function riteProjectInterruptions(engine,document){
 const active=recordsWhere(document.state.records,'category','rite_project').filter(stored=>stored.status==='active'&&!performing.get(engine)?.has(stored.id));
 if(!active.length)return [];
 const registry=primitiveRuntime.registry(engine),plans=[];
 for(const stored of active){
  const action=findAction(registry,stored.action),stage=action?.rite?.stages?.[stored.stage];
  if(!stage)reject('E-RITE-DATA','活动仪式工程缺少原有阶段定义');
  const current=projectState(engine,document,action,stored.slots,stored.actor,stage,stored,'perform',{until:document.state.minute});
  if(!current.interruption)continue;
  const eventId=`rite-interrupt:${digest({project:stored.id,lastEvent:stored.lastEvent,reason:current.interruption,deadline:stored.deadline}).slice(0,48)}`;
  plans.push({eventId,project:stored.id,action:action.id,actor:stored.actor,slots:clone(stored.slots),location:stored.location,reason:current.interruption,
   effects:[{op:'emit',verb:'tell',visibility:'witnessed',payload:{kind:'rite_unfinished',project:stored.id,action:action.id,reason:current.interruption}},...actionEffects({outcomes:action.rite.interrupt?.effects??[]},stored.slots,stored.actor)]});
 }
 return plans;
}

export function settleRiteInterruptions(d,engine){
 const plans=riteProjectInterruptions(engine,d.document);
 if(plans.length&&typeof engine.primitiveRiteInterruption!=='function')reject('E-PRIMITIVE-CONNECTOR','仪式自动中断尚缺系统后果事务接点');
 for(const plan of plans){
  // This is a consequence, not a new initiative by a sleeping/dead officiant.
  // Do not forge a live actor frame here or bypass its capacity protection.
  const result=engine.primitiveRiteInterruption(d.document,clone(plan),{scheduler:d.scheduler?{seq:d.scheduler.seq,lastSettled:d.scheduler.lastSettled}:null,reactionContext:d.reactionTick?.active});
  if(result?.receipt?.status!=='committed')reject('E-RITE-INTERRUPTION','仪式中断后果尚未完成结算');
  for(const patch of result.patches)if(patch.op==='set')d.set(patch.path,patch.value);else d.remove(patch.path);
  if(d.scheduler)d.scheduler.seq=Math.max(d.scheduler.seq,d.get('state','scheduler','seq')??0);
  if(result.reactionQueue?.length){if(!d.reactionTick)beginReactionTick(d);d.reactionTick.queue.push(...result.reactionQueue);}
  const key=`rite_project:${plan.project}`,stored=d.get('state','records',key);
  d.set(['state','records',key],{...stored,status:'unfinished',outcome:plan.reason,lastEvent:plan.eventId,updatedAt:d.get('state','minute')});
  updateEntity(d,{id:plan.project,facts:{status:'unfinished'},writer:'action-rite',eventId:plan.eventId});
  const action=findAction(primitiveRuntime.registry(engine),plan.action);
  markRiteInterrupted(d,engine,action,{...plan,target:plan.slots.target??plan.actor});
 }
 return plans;
}

export function prepareRite(engine,document,input,{actor='player'}={}){
 const {action:id,slots={}}=input.args??{},project=input.args?.project??slots.project??null,operation=input.args?.operation??slots.operation??'perform',registry=primitiveRuntime.registry(engine),action=findAction(registry,id);
 if(!action?.rite||!action.outcomes)reject('E-RITE-ACTION','这不是已登记的仪式动作');
 if(!slots||typeof slots!=='object'||Array.isArray(slots)||Object.keys(slots).some(k=>!action.slots.some(s=>s.name===k)))reject('E-RITE-SLOT','仪式槽位无效');
 for(const slot of action.slots)if(slot.required&&!Object.hasOwn(slots,slot.name))reject('E-RITE-SLOT',`仪式还缺：${slot.name}`);
 if(!['perform','interrupt'].includes(operation))reject('E-RITE-OPERATION','请选择继续或中断仪式');
 const stages=action.rite.stages;
 if(!Array.isArray(stages)||!stages.length||stages.length>16)reject('E-RITE-DATA','仪式须声明有限阶段');
 const stored=project?document.state.records?.[`rite_project:${project}`]:null;
 if(project&&(!stored||stored.action!==action.id||stored.actor!==actor||stored.status!=='active'||digest(stored.slots)!==digest(domainSlots(slots))))reject('E-RITE-PROJECT','该仪式工程不能由本次参数继续');
 if(operation==='interrupt'&&!stored)reject('E-RITE-PROJECT','没有可中断的仪式工程');
 const index=stored?.stage??0,stage=stages[index];if(!stage)reject('E-RITE-STAGE','这个仪式已经没有待完成阶段');
 const minutes=nonnegative(stage.minutes,'阶段耗时');if(minutes>43200)reject('E-RITE-DATA','阶段过长，须拆分工程');
 const {expired,interruption,waiting,...facts}=projectState(engine,document,action,slots,actor,stage,stored,operation);
 if(waiting)reject('E-RITE-WINDOW','尚未到仪式所需的时窗');
 const costs=interruption?[]:materialsFor(engine,actor,stage);
 const vow=action.rite.costs?.vow;
 if(vow!==undefined&&(!vow||typeof vow!=='object'||Array.isArray(vow)||vow.op!==undefined&&vow.op!=='obligation.create'||vow.obligationKind!==undefined&&vow.obligationKind!=='vow'||vow.debtor!==undefined&&vow.debtor!=='$actor'&&vow.debtor!==actor))reject('E-RITE-DATA','誓约须为主祭自愿承担的 vow 义务');
 const totals=new Map();for(const effect of costs)totals.set(effect.from,(totals.get(effect.from)??0)+effect.qty);
 for(const [key,qty] of totals)if((document.ledger?.accounts?.[key]??0)<qty)reject('E-RITE-MATERIAL','仪式所需的实际材料不足');
 return {action,slots:clone(slots),actor,project,stored,index,stage,minutes,costs,operation,expired,interruption,...facts};
}

export function executeRite(engine,document,input,{actor='player',preview=false}={}){
 const request=digest({actor,args:input.args}),old=document.state.records?.[`primitive:${input.eventId}`]?.receipt;
 if(old){if(old.rite?.request!==request)reject('E-PRIMITIVE-DUPLICATE','该事件编号已用于别的仪式');return {patches:[],events:[],receipt:{...clone(old),duplicate:true}};}
 const prepared=prepareRite(engine,document,input,{actor}),{action,slots,stage,index}=prepared;
 const project=prepared.project??(action.rite.stages.length>1?`project_${digest({eventId:input.eventId}).slice(0,32)}`:null);
 if(preview){
  const vow=prepared.interruption?[]:vowFor(action,slots,actor,project,input.eventId,prepared.stored),discipline=prepared.interruption?[]:disciplineEvidence(engine,document,action,actor);
  return {receipt:{eventId:input.eventId,status:'preview',actor,routed:action.id,applied:[],cost:{time:prepared.interruption?0:prepared.minutes,resources:prepared.costs,...(vow.length?{vow}:{}),...(discipline.length?{discipline}:{})},rite:{stage:stage.id,project:prepared.project,...(prepared.interruption?{interruption:prepared.interruption}:{}),diagnosis:'依主祭当前所知判断，实际效力在仪式结束后揭晓'}}};
 }
 const signal={op:'emit',verb:'tell',visibility:'witnessed',payload:{kind:'rite_attempt',action:action.id,stage:stage.id}};
 let minutes=0,terminal='active',outcome='success',limits=clone(action.rite.limits??{}),resultProject=null,paid=null,culture=null,discipline=[];
 const frame=createRuntimePrimitiveFrame(engine,document,{actor,eventId:input.eventId,source:{kind:'catalog',id:action.id},identity:{request},limits:()=>limits,
  consequence:()=>terminal==='unfinished',
  prepare:(d,{receipt})=>{
   const current=prepareRite(engine,d.document,input,{actor}),now=d.get('state','minute');
   const interrupted=Boolean(current.interruption);
   if(project&&!current.stored){
    const duration=action.rite.expiresWithin??Math.max(1,action.rite.stages.reduce((n,s)=>n+nonnegative(s.minutes,'阶段耗时'),0)*2);
    createEntity(d,{id:project,kind:'project',facts:{action:action.id,author:actor,progress:0,status:'active'},source:action.id,writer:'action-rite',eventId:input.eventId});
    resultProject={category:'rite_project',id:project,action:action.id,actor,slots:clone(domainSlots(slots)),location:current.location,stage:0,status:'active',startedAt:now,deadline:now+nonnegative(duration,'工程期限')};
   }else resultProject=current.stored;
   if(interrupted){terminal='unfinished';outcome=current.interruption;return [signal,...actionEffects({outcomes:action.rite.interrupt?.effects??[]},slots,actor)];}
   const check=stage.check??action.check;
   if(check)receipt.check=engine.primitiveCheck(d,actionEffects({outcomes:check},slots,actor),`${input.eventId}:rite-check`,actor);
   const grade=gradeEffects(engine,action,slots,actor,receipt.check?.degree);
   const family=familyDegree(engine,'rite',grade.row.key);
   discipline=disciplineEvidence(engine,d.document,action,actor);
   if(family.materials!==undefined)current.costs=current.costs.map(effect=>({...effect,qty:Math.ceil(effect.qty*family.materials)})).filter(effect=>effect.qty>0);
   const vows=vowFor(action,slots,actor,project,input.eventId,current.stored);
   outcome=grade.row.key;minutes=current.minutes*grade.row.timeMultiplier;
   // Pay before the time span: death can move the inventory into a corpse,
   // and the stage cannot consume the same material afterwards a second time.
   if(current.costs.length||vows.length){
    const costFrame=createRuntimePrimitiveFrame(engine,d.document,{actor,eventId:`rite-materials:${digest({eventId:input.eventId}).slice(0,48)}`,source:{kind:'rule',id:`${action.id}:materials`},createDraft:doc=>{const child=engine.primitiveDraft(doc);if(child.scheduler&&d.scheduler)child.scheduler.seq=Math.max(child.scheduler.seq,d.scheduler.seq);return child;},finish:(_d,{receipt:costReceipt})=>{costReceipt.cost={};recordResourceCosts(costReceipt,current.costs,{sources:current.costs.map(()=>({kind:'catalog',id:action.id}))});}});
    paid=commitPrimitiveConsequences(d.document,[...current.costs,...vows],costFrame,{reactionContext:d.reactionTick?.active});
    for(const patch of paid.patches)if(patch.op==='set')d.set(patch.path,patch.value);else d.remove(patch.path);
    if(d.scheduler)d.scheduler.seq=Math.max(d.scheduler.seq,d.get('state','scheduler','seq')??0);
    if(paid.reactionQueue?.length){if(!d.reactionTick)beginReactionTick(d);d.reactionTick.queue.push(...paid.reactionQueue);}
   }
   beginBodyActivity(d,engine,actor,'light');engine.advance(d,minutes,`${input.eventId}:rite-time`);endBodyActivity(d,engine,actor);
   // Recheck presence/qualification at completion. Losing a role or passing
   // the project deadline consumes this stage's resources but no success.
   let broken=resultProject&&d.get('state','minute')>=resultProject.deadline;
   try{visibleInputs(engine,d.document,action,slots,actor,stage,{until:d.get('state','minute')});}catch(error){if(!disruption(error))throw error;broken=true;}
   if(broken){terminal='unfinished';outcome='interrupted';return [signal,...actionEffects({outcomes:action.rite.interrupt?.effects??[]},slots,actor)];}
   const success=grade.row.multiplier>0,final=index===action.rite.stages.length-1;
   terminal=family.unfinished?'unfinished':success?(final?'completed':'active'):'unfinished';
   // Explicit outcomes also own failure/indivisible effects. Only a default
   // array loses its success effects on failure; do not discard authored ones.
   let selected=final?grade.effects:gradeEffects(engine,{...action,outcomes:stage.outcomes??stage.effects??[]},slots,actor,receipt.check?.degree).effects;
   culture=cultureEffect(engine,d.document,action,current.target,actor);
   if(culture.affinity!==1)selected=selected.flatMap(effect=>{
    const field=effect.op==='vital'||effect.op==='fact.set'?'delta':effect.op==='learn'?'amount':effect.op==='status'?'magnitude':null;
    if(field&&Number.isSafeInteger(effect[field])){const n=Math.trunc(effect[field]*culture.affinity);return n?[{...effect,[field]:n}]:[];}
    // A reduced funeral/exorcism cannot half-transfer or half-terminate its
    // subject. Such outcomes need an explicit cultural alternative.
    return [];
   });
   if(culture.affinity<1&&terminal==='completed'){terminal='unfinished';outcome=culture.affinity===0?'ineffective':'partial';}
   if(success&&final&&!predicate(engine,d.document,action.rite.actualTarget,{actor,target:current.target,truth:true})){
    selected=actionEffects({outcomes:action.rite.misdiagnosis?.effects??[]},slots,actor);terminal='unfinished';outcome='ineffective';
   }
   if(family.backlash)selected.push(...actionEffects({outcomes:action.rite.backlash?.effects??action.rite.costs?.backlash?.effects??[]},slots,actor));
   if(family.unnoticed)selected=selected.map(effect=>({...effect,visibility:'private'}));
   return [{...signal,...(family.unnoticed?{visibility:'private'}:{})},...selected];
  },
  finish:(d,{receipt})=>{
   if(resultProject){
    const row={...resultProject,stage:terminal==='active'?index+1:index,status:terminal,lastEvent:input.eventId,updatedAt:d.get('state','minute')};
    d.set(['state','records',`rite_project:${project}`],row);
    updateEntity(d,{id:project,facts:{progress:terminal==='completed'?100:Math.floor((index+(terminal==='active'?1:0))*100/action.rite.stages.length),status:terminal},writer:'action-rite',eventId:input.eventId});
   }
   receipt.rite={request,project,stage:stage.id,status:terminal,outcome,...(culture?{culture}:{})};receipt.cost={time:minutes,resources:paid?.receipt.cost.resources??[],...(paid?{resourceEvent:paid.receipt.eventId}:{}),...(discipline.length?{discipline}:{}),...(paid?.receipt.applied.some(e=>e.op==='obligation.create')?{vow:paid.receipt.applied.filter(e=>e.op==='obligation.create')}:{})};
   if(terminal==='unfinished')receipt.rite.interrupt=markRiteInterrupted(d,engine,action,{actor,target:slots.target??actor,project,eventId:input.eventId,location:prepared.location});
   if(terminal==='unfinished')receipt.narrate.mustNot.push({kind:'rite_fulfilled'});
   // The stage is now settled. Reactions to its published events may invalidate
   // a continuing project, so do not suppress its lifecycle during publication.
   performing.get(engine)?.delete(project);
  }});
 const active=performing.get(engine)??new Set();performing.set(engine,active);active.add(project);
 try{return commitPrimitives(document,[signal],frame);}finally{active.delete(project);if(!active.size)performing.delete(engine);}
}
