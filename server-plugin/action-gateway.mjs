// A1 动作入口（L4）：/execute 收到 world_act 时先按注册表翻译成它所别名的旧公开工具调用，
// 事件里存的就是这条旧调用，回放、对账、审查与旧工具完全一致；结算后用已应用效果生成事件流文字。
import {loadActionRegistry,actionCall,actionOfCall,findAction} from './action-registry.mjs';
import {actionLines} from './action-text.mjs';

// world_read/world_search/world_catalog 由前端直接读，不进账本。
export const CLIENT_READS=new Set(['world_read','world_search','world_catalog']);
export function translateCall(tool,args,registry=loadActionRegistry()){
 if(tool==='world_actions')throw Error('world_actions 只查目录，请用 /actions');
 if(tool!=='world_act')return {tool,args,action:null};
 const call=actionCall(registry,args?.action,args?.slots??{});
 if(call.projection)throw Error(`${call.action.label}只是看一看，不写进账本；请用 /actions 读取`);
 if(CLIENT_READS.has(call.tool))throw Error(`${call.action.label}是只读查询，请直接调用 ${call.tool}`);
 return {tool:call.tool,args:call.args,action:call.action};
}
// The registered action a call was (world_act or a legacy tool call), and its event-stream lines.
export function narrateExecution({engine,before,after,tool,args,result,action=null,registry=loadActionRegistry(),locale}){
 const chosen=action??actionOfCall(registry,tool,args??{});
 const {lines,effects}=actionLines({engine,action:chosen,before,after,args,result,...(locale?{locale}:{})});
 return {action:chosen?.id??null,lines,applied:effects};
}
export {findAction};
