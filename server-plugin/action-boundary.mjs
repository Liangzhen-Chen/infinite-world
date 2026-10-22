import {ActionRejection} from './action-rejection.mjs';

// Only routed catalog actions have a public refusal contract, and only a typed
// business rejection (06 §6.10.4) becomes a refusal receipt. Plain Error,
// TypeError and every other internal failure propagate unchanged, whatever
// language their message is in: an engine fault is never a world precondition.
const BUSINESS_REJECTIONS=[ActionRejection];
export const isBusinessRejection=error=>BUSINESS_REJECTIONS.some(type=>error instanceof type);
export async function actionBoundary(engine,document,input,run,{preview=false}={}){
 try{return await run();}
 catch(error){
  const action=input.tool==='world_act'&&engine.primitiveActionDefinition(input.args?.action);
  if(!action||!isBusinessRejection(error))throw error;
  const slots=structuredClone(input.args?.slots??{});
  // The archived catalog's scene projection needs no invented slot, resource,
  // permission or remote entity. It is a feasible way to inspect conditions.
  const look=engine.primitiveActionDefinition('core:look');
  const alternatives=look?.id!==action.id&&look?.projection==='scene'&&look.readOnly&&!look.slots.length
   ?[{action:look.id,label:look.label,slots:{}}]:[];
  const mark=engine.primitiveActionDefinition('open:leave_mark'),form=engine.world.openActionRules?.mark?.forms?.[0];
  const permission=mark&&form?engine.actionPermission(document,{action:mark.id,slots:{intent:action.label,form}}):null;
  const fallback={action:'open:leave_mark',intent:action.label,available:action.id!=='open:leave_mark'&&Boolean(mark&&form&&permission?.allowed!==false&&engine.world.openReactions&&engine.world.openTagging)};
  const code=error.code,missing=error.missing?.length?error.missing:[error.message];
  const repair=error.repair?.length?error.repair:[`先满足当前条件：${error.message}`,...alternatives.map(a=>`可改选当前目录中的「${a.label}」（${a.action}），按目录补全条件并预览`)];
  const routing={status:'routed',routed:action.id,slots,reason:error.message,missing,repair,alternatives,fallback};
  const receipt={eventId:input.eventId,actor:'player',source:{kind:'catalog',id:action.id},routed:action.id,status:'rejected',code,reason:error.message,missing,repair,applied:[],events:[],cost:{time:0,resources:[]},routing};
  return preview?{receipt,routing}:{patches:[],result:{ok:false,action:action.id,receipt,events:[],minute:document.state.minute,messages:[],notices:[]}};
 }
}
