import {isDomainRejection,refusalProjection} from './action-rejection.mjs';
import {executeLeaveMark} from './mark-actions.mjs';
import {findAction} from './action-registry.mjs';
import {applyPatches} from './storage.mjs';

export const isBusinessRejection=isDomainRejection;
// A native preview can itself use reduce(). Its caller needs the actual
// precondition result, without recursively repairing the probe's refusal.
const probes=new WeakSet();
const definition=(engine,id)=>findAction({byId:{get:key=>engine.primitiveActionDefinition(key)}},id);

export function markFallback(engine,document,intent,{actor='player'}={}){
 const fallback={action:'open:leave_mark',intent,available:false,label:'保留原意，留下带标签的痕迹',missing:[]};
 const form=engine.world.openActionRules?.mark?.forms?.[0];
 if(!engine.primitiveActionDefinition('open:leave_mark')||!form||!engine.world.openReactions||!engine.world.openTagging){
  fallback.missing=['当前没有可用的留痕做法'];return fallback;
 }
 const slots={intent,form};
 let eventId='refusal:mark:preview';
 while(document.state.records?.[`primitive:${eventId}`])eventId+='x';
 try{
  const result=executeLeaveMark(engine,document,{eventId,args:{slots}},{actor,preview:true});
  if(result.receipt.status==='preview')Object.assign(fallback,{available:true,slots,reason:'只留下痕迹，不会实现原方案的效果'});
 }catch(error){
  if(!isBusinessRejection(error))throw error;
  fallback.missing=error.missing?.length?[...error.missing]:[error.message];fallback.reason=error.message;
 }
 return fallback;
}

async function checkedAlternative(engine,document,action,slots,label){
 let eventId='refusal:action:preview';
 while(document.state.records?.[`primitive:${eventId}`])eventId+='x';
 const input={tool:'world_act',eventId,args:{action,slots}};
 probes.add(input);
 try{
  const result=await engine.previewActionResult(document,input),receipt=result.receipt??result.result?.receipt;
  if(receipt?.status==='preview')return {action,slots:structuredClone(slots),label,available:true,missing:[]};
  return null;
 }catch(error){if(!isBusinessRejection(error))throw error;return null;}
 finally{probes.delete(input);}
}

async function enrich(engine,document,input,receipt,prepared){
 const open=input.tool==='world_propose'||input.args?.action==='open:proposal';
 const proposal=open?(input.tool==='world_propose'?input.args:input.args?.slots):null;
 const routing=receipt.routing??prepared??{};
 const action=definition(engine,receipt.routed??input.args?.action);
 const intent=proposal?.intent??routing.intent??input.args?.slots?.intent??action?.label??'原方案';
 const details=refusalProjection({...routing,...receipt,reason:receipt.reason??routing.reason});
 const markAdvice='也可保留原意，改为留下带标签的痕迹；只留痕，不算原方案成功';
 const priorChecked=details.alternatives.filter(row=>row.action&&row.available!==false);
 details.repair=details.repair.filter(text=>text!==markAdvice&&!priorChecked.some(row=>text===row.label||text.startsWith(`${row.label}；`)));
 // Receipts from a failed sequence were checked against staged state. Recheck
 // executable advice against the actual rolled-back document before showing it.
 const advice=[];
 for(const row of details.alternatives){
  if(!row.action||row.available===false){advice.push(row);continue;}
  const checked=await checkedAlternative(engine,document,row.action,row.slots??{},row.label);
  if(checked){advice.push(checked);details.repair.push(checked.label);}
 }
 details.alternatives=advice;
 // A smaller quantity keeps all endpoints and other choices intact. The
 // actual program, including permission/consent, must accept its preview.
 const slots=routing.slots??input.args?.slots;
 if(action&&slots)for(const name of ['quantity','qty','coins','days','minutes']){
  if(!Number.isSafeInteger(slots[name])||slots[name]<=1)continue;
  const label={quantity:'数量',qty:'数量',coins:'交付铜钱',days:'天数',minutes:'时长（分钟）'}[name];
  const candidate=await checkedAlternative(engine,document,action.id,{...slots,[name]:1},`把「${action.label??action.id}」的${label}减为 1 再尝试，其余分阶段安排`);
  if(candidate){if(!details.alternatives.some(row=>row.action===candidate.action&&JSON.stringify(row.slots)===JSON.stringify(candidate.slots)))details.alternatives.push(candidate);details.repair.push(candidate.label+'；这里只确认能预览，结果仍由实际结算决定');break;}
 }
 details.fallback=markFallback(engine,document,intent);
 if(details.fallback.available)details.repair.push(markAdvice);
 details.repair=[...new Set(details.repair)];
 return {...receipt,...details,routing:{...routing,...details,...(proposal?{intent,proposal:structuredClone(proposal)}:{})}};
}

export async function actionBoundary(engine,document,input,run,{preview=false}={}){
 if(probes.has(input))return run();
 const action=input.tool==='world_act'&&definition(engine,input.args?.action);
 if(!action&&input.tool!=='world_propose')return run();
 let result;
 try{result=await run();}
 catch(error){
  if(!isBusinessRejection(error))throw error;
  let details=refusalProjection({...error,reason:error.message}),prepared;
  // A commit of an unfinished open plan must explain its actual missing
  // choices, rather than replacing them with a transport-oriented instruction.
  if(error.code==='E-OPEN-NOT-ROUTED'){
   const {prepareOpenAction}=await import('./open-actions.mjs');
   prepared=prepareOpenAction(engine,document,input.tool==='world_propose'?input.args:input.args.slots);
   details=refusalProjection(prepared);
  }
  if(error.code==='E-OPEN-ENTITY')details=refusalProjection({reason:'指定对象当前不在你能确认和接触的范围内',missing:['可确认且可接触的对象'],repair:['选择眼前已知的对象，或先通过已知路线与对方会合，再预览原方案']});
  const receipt=await enrich(engine,document,input,{
   eventId:input.eventId,actor:'player',source:{kind:input.tool==='world_propose'?'open':'catalog',id:action?.id??'open:proposal'},
   routed:action?.id??null,status:'rejected',code:error.code,...(error.index!==undefined?{index:error.index}:{}),
   ...details,applied:[],events:[],cost:{time:0,resources:[]},
   routing:prepared??{status:action?'routed':'rejected',routed:action?.id??null,...(action?{slots:structuredClone(input.args?.slots??{})}:{})}
  });
  return preview?{receipt,routing:receipt.routing}:{patches:[],result:{ok:false,action:action?.id??'open:proposal',receipt,events:[],minute:document.state.minute,messages:[],notices:[]}};
 }
 const receipt=result?.receipt??result?.result?.receipt;
 if(!['rejected','not_submitted'].includes(receipt?.status))return result;
 // A settled contest may include another action's state changes. Advice must
 // use the returned world, while a rolled-back sequence still has no patches.
 const current=result.patches?.length?applyPatches(document,result.patches):document;
 const projected=await enrich(engine,current,input,receipt,result.prepared??result.routing);
 if(result.receipt)return {...result,receipt:projected,routing:projected.routing,...(result.prepared?{prepared:{...result.prepared,...refusalProjection(projected)}}:{})};
 return {...result,result:{...result.result,...(projected.status==='rejected'?{ok:false}:{}),receipt:projected}};
}
