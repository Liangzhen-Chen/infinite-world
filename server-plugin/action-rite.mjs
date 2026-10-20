// Native registered rite adapter (13 §13.5). The action program, roles,
// predicates and costs always come from the archived registry, not a proposal.
import {primitiveRuntime,createRuntimePrimitiveFrame,actionEffects} from './primitives-runtime.mjs';
import {commitPrimitives} from './primitives.mjs';
import {reject} from './primitive-policy.mjs';
import {compileRX,evaluateRX} from './rx.mjs';
import {createRXLibrary} from './rx-library.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {actionEntity,capacity,actionReader} from './action-capacity.mjs';
import {createEntity,updateEntity,declareHoldingWriter,isPhysicallyDead} from './holdings.mjs';
import {accountKey} from './ledger.mjs';
import {digest} from './storage.mjs';
import {beginBodyActivity,endBodyActivity} from './primitives-body.mjs';
import {consent} from './action-consent.mjs';
import {findAction} from './action-registry.mjs';

declareHoldingWriter('action-rite',{entities:['project']});
const location=(document,id)=>id==='player'?document.state.location:document.state.npcs?.[id]?.location??document.holdings?.locations?.[id]?.at;
const nonnegative=(n,label)=>{if(!Number.isSafeInteger(n)||n<0)reject('E-RITE-DATA',`${label}须是非负整数`);return n;};
const clone=structuredClone;
const domainSlots=slots=>Object.fromEntries(Object.entries(slots).filter(([key])=>!['project','operation'].includes(key)));
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
  schema.truth={tags:['string'],dead:'boolean'};
 }
 const compiled=compileRX(source,{schema,functions:library.signatures});
 return evaluateRX(compiled,bindings,{functions:library.functions})===true;
}
function present(engine,document,id,at){
 const body=id==='player'?document.state.player:document.state.npcs?.[id];
 return Boolean(id&&body&&!body.scheduleTravel&&!body.cognitionTravel&&location(document,id)===at&&capacity({engine,document},id,'rite').level!=='none'&&!isPhysicallyDead(engine,actionReader(document),id));
}
function visibleInputs(engine,document,action,slots,actor,stage,{until=document.state.minute+stage.minutes}={}){
 const rite=action.rite,target=slots.target??actor,at=location(document,actor);
 if(!at)reject('E-RITE-PLACE','主祭必须在实际场所主持仪式');
 if(rite.location&&rite.location!==at)reject('E-RITE-PLACE','这里不是仪式所需的场所');
 if(!present(engine,document,actor,at))reject('E-RITE-ACTOR','主祭此刻无法主持仪式');
 if(!predicate(engine,document,rite.officiant,{actor,target}))reject('E-RITE-QUALIFICATION','主祭尚不具备仪式要求的资格');
 if(!predicate(engine,document,rite.target,{actor,target}))reject('E-RITE-DIAGNOSIS','依你所知，这不是适合该仪式的对象');
 if(target!==actor&&location(document,target)!==at)reject('E-RITE-TARGET','仪式对象已不在这里');
 const people=new Set([actor]);
 for(const role of rite.roles??[]){
  const ids=slots.roles?.[role.role]??[];
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.length<nonnegative(role.min??1,'角色人数'))reject('E-RITE-ROLE',`缺少仪式角色：${role.role}`);
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
function gradeEffects(action,slots,actor,degree,table){
 const row=table?.[degree??'成功'];if(!row)reject('E-RITE-DATA','缺少统一的检定档位数据');
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
 const expired=stored&&stored.deadline<=document.state.minute;
 const facts=operation==='interrupt'||expired?{target:slots.target??actor,location:stored.location}:visibleInputs(engine,document,action,slots,actor,stage);
 const costs=operation==='interrupt'||expired?[]:materialsFor(engine,actor,stage);
 const totals=new Map();for(const effect of costs)totals.set(effect.from,(totals.get(effect.from)??0)+effect.qty);
 for(const [key,qty] of totals)if((document.ledger?.accounts?.[key]??0)<qty)reject('E-RITE-MATERIAL','仪式所需的实际材料不足');
 return {action,slots:clone(slots),actor,project,stored,index,stage,minutes,costs,operation,expired,...facts};
}

export function executeRite(engine,document,input,{actor='player',preview=false}={}){
 const request=digest({actor,args:input.args}),old=document.state.records?.[`primitive:${input.eventId}`]?.receipt;
 if(old){if(old.rite?.request!==request)reject('E-PRIMITIVE-DUPLICATE','该事件编号已用于别的仪式');return {patches:[],events:[],receipt:{...clone(old),duplicate:true}};}
 const prepared=prepareRite(engine,document,input,{actor}),{action,slots,stage,index}=prepared;
 if(preview)return {receipt:{eventId:input.eventId,status:'preview',actor,routed:action.id,applied:[],cost:{time:prepared.expired||prepared.operation==='interrupt'?0:prepared.minutes,resources:prepared.costs},rite:{stage:stage.id,project:prepared.project,diagnosis:'依主祭当前所知判断，实际效力在仪式结束后揭晓'}}};
 const project=prepared.project??(action.rite.stages.length>1?`project_${digest({eventId:input.eventId}).slice(0,32)}`:null);
 const signal={op:'emit',verb:'tell',visibility:'witnessed',payload:{kind:'rite_attempt',action:action.id,stage:stage.id}};
 let minutes=0,terminal='active',outcome='success',limits=clone(action.rite.limits??{}),resultProject=null;
 const frame=createRuntimePrimitiveFrame(engine,document,{actor,eventId:input.eventId,source:{kind:'catalog',id:action.id},identity:{request},limits:()=>limits,
  prepare:(d,{receipt})=>{
   const current=prepareRite(engine,d.document,input,{actor}),now=d.get('state','minute');
   const interrupted=current.operation==='interrupt'||current.expired;
   if(project&&!current.stored){
    const duration=action.rite.expiresWithin??Math.max(1,action.rite.stages.reduce((n,s)=>n+nonnegative(s.minutes,'阶段耗时'),0)*2);
    createEntity(d,{id:project,kind:'project',facts:{action:action.id,author:actor,progress:0,status:'active'},source:action.id,writer:'action-rite',eventId:input.eventId});
    resultProject={category:'rite_project',id:project,action:action.id,actor,slots:clone(domainSlots(slots)),location:current.location,stage:0,status:'active',startedAt:now,deadline:now+nonnegative(duration,'工程期限')};
   }else resultProject=current.stored;
   if(interrupted){terminal='unfinished';outcome=current.expired?'expired':'interrupted';return [signal,...actionEffects({outcomes:action.rite.interrupt?.effects??[]},slots,actor)];}
   const check=stage.check??action.check;
   if(check)receipt.check=engine.primitiveCheck(d,actionEffects({outcomes:check},slots,actor),`${input.eventId}:rite-check`,actor);
   const grade=gradeEffects(action,slots,actor,receipt.check?.degree,engine.world.openActionRules?.degrees);
   outcome=grade.row.key;minutes=current.minutes*grade.row.timeMultiplier;
   beginBodyActivity(d,engine,actor,'light');engine.advance(d,minutes,`${input.eventId}:rite-time`);endBodyActivity(d,engine,actor);
   // Recheck presence/qualification at completion. Losing a role or passing
   // the project deadline consumes this stage's resources but no success.
   let broken=resultProject&&d.get('state','minute')>=resultProject.deadline;
   try{visibleInputs(engine,d.document,action,slots,actor,stage,{until:d.get('state','minute')});}catch(error){if(!error.code?.startsWith('E-RITE-'))throw error;broken=true;}
   if(broken){terminal='unfinished';outcome='interrupted';return [...current.costs,signal,...actionEffects({outcomes:action.rite.interrupt?.effects??[]},slots,actor)];}
   const success=grade.row.multiplier>0,final=index===action.rite.stages.length-1;
   terminal=success?(final?(grade.row.key==='partial'?'unfinished':'completed'):'active'):'unfinished';
   let selected=success?(final?grade.effects:gradeEffects({...action,outcomes:stage.outcomes??stage.effects??[]},slots,actor,receipt.check?.degree,engine.world.openActionRules?.degrees).effects):[];
   if(success&&final&&!predicate(engine,d.document,action.rite.actualTarget,{actor,target:current.target,truth:true})){
    selected=actionEffects({outcomes:action.rite.misdiagnosis?.effects??[]},slots,actor);terminal='unfinished';outcome='ineffective';
   }
   if(grade.row.key==='fumble')selected.push(...actionEffects({outcomes:action.rite.backlash?.effects??[]},slots,actor));
   return [...current.costs,signal,...selected];
  },
  finish:(d,{receipt})=>{
   if(resultProject){
    const row={...resultProject,stage:terminal==='active'?index+1:index,status:terminal,lastEvent:input.eventId,updatedAt:d.get('state','minute')};
    d.set(['state','records',`rite_project:${project}`],row);
    updateEntity(d,{id:project,facts:{progress:terminal==='completed'?100:Math.floor((index+(terminal==='active'?1:0))*100/action.rite.stages.length),status:terminal},writer:'action-rite',eventId:input.eventId});
   }
   receipt.rite={request,project,stage:stage.id,status:terminal,outcome};receipt.cost={time:minutes,resources:prepared.costs};
   if(terminal==='unfinished')receipt.narrate.mustNot.push({kind:'rite_fulfilled'});
  }});
 return commitPrimitives(document,[signal],frame);
}
