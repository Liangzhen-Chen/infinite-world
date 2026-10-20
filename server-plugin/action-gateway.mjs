// A1 动作入口（L4）：/execute 收到 world_act 时先按注册表翻译成它所别名的旧公开工具调用，
// 事件里存的就是这条旧调用，回放、对账、审查与旧工具完全一致；结算后用已应用效果生成事件流文字。
import {loadActionRegistry,actionCall,actionOfCall,findAction} from './action-registry.mjs';
import {actionLines} from './action-text.mjs';

// world_read/world_search/world_catalog 由前端直接读，不进账本。
export const CLIENT_READS=new Set(['world_read','world_search','world_catalog']);
export function translateCall(tool,args,registry=loadActionRegistry()){
 if(tool==='world_actions')throw Error('world_actions 只查目录，请用 /actions');
 if(tool!=='world_act')return {tool,args,action:null};
 const definition=findAction(registry,args?.action);
 if(definition?.outcomes)return {tool,args,action:definition};
 const call=actionCall(registry,args?.action,args?.slots??{});
 if(call.projection)throw Error(`${call.action.label}只是看一看，不写进账本；请用 /actions 读取`);
 if(CLIENT_READS.has(call.tool))throw Error(`${call.action.label}是只读查询，请直接调用 ${call.tool}`);
 return {tool:call.tool,args:call.args,action:call.action};
}
// 单次推进上限（engine.time 与 advance 的“耗时”界）：30 天 = 43200 分，沿用最初版本的约定，也是提示里给模型的换算（30天43200分）。
// 这是引擎对一条事件的界，不是缺陷；world_act 层把更长的等待拆成若干条“不超过一界”的 world_time 事件，逐段结算，
// 结果与玩家自己分几次等完全相同。拆分后的总长另设一年（12 月 × 30 日）为限，免得一次点击拖住服务器。
export const SPAN_CAP=43200,SPAN_LIMIT=360*1440;
// The segments (legacy world_time argument objects) a long wait is run as, or null when one event does (or the call is not a wait).
// `now` is the current minute; an `until` target is measured from it exactly as the engine measures it.
export function timeSegments(tool,args,now){
 if(tool!=='world_time'||!args||args.minutes!==undefined&&args.until!==undefined)return null;
 let total=null;
 if(args.until!==undefined){
  const u=args.until;if(!u||typeof u!=='object'||Array.isArray(u))return null;
  const {dayOffset:day,hour,minute=0}=u;
  if(![day,hour,minute].every(Number.isSafeInteger)||day<0||hour<0||hour>23||minute<0||minute>59)return null;
  total=(Math.floor(now/1440)+day)*1440+hour*60+minute-now;
 }else if(Number.isSafeInteger(args.minutes))total=args.minutes;
 if(total===null||total<=SPAN_CAP)return null;
 if(total>SPAN_LIMIT)throw Error('一次最多等一年（360天）；再久的等待请分几次');
 const {until,minutes,...rest}=args,out=[];
 for(let left=total;left>0;left-=SPAN_CAP)out.push({...rest,minutes:Math.min(left,SPAN_CAP)});
 return out;
}
// The registered action a call was (world_act or a legacy tool call), and its event-stream lines.
export function narrateExecution({engine,before,after,tool,args,result,action=null,registry=loadActionRegistry(),locale}){
 const chosen=action??actionOfCall(registry,tool,args??{});
 const {lines,effects}=actionLines({engine,action:chosen,before,after,args,result,...(locale?{locale}:{})});
 return {action:chosen?.id??null,lines,applied:effects};
}
export {findAction};
