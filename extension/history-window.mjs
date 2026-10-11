const finite=value=>Number.isFinite(value)&&value>=0;
async function fingerprint(value){
 const hash=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
 return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
const user=(message,format)=>format==='host'?message.is_user===true:message.role==='user';
function completeToolChain(messages,format){
 if(format==='host')return messages.every(message=>(message.extra?.tool_invocations??[]).every(call=>typeof call.result==='string'||call.result!==undefined));
 const pending=new Set(),used=new Set();
 for(const message of messages){
  if(message.tool_calls){
   if(message.role!=='assistant'||pending.size)return false;
   for(const call of message.tool_calls){if(!call.id||used.has(call.id))return false;pending.add(call.id);used.add(call.id);}
  }else if(message.role==='tool'){
   if(!pending.delete(message.tool_call_id))return false;
  }else if(pending.size)return false;
 }
 return pending.size===0;
}

// Counts come from the existing host tokenizer. This module neither estimates
// tokens nor reads a save, calls a model, hides chat, or changes message objects.
export async function groupHistory(messages,{format='host',anchors=[],tokenCounts=[]}={}){
 if(!Array.isArray(messages)||!['host','api'].includes(format)||tokenCounts.length!==messages.length||!tokenCounts.every(finite))throw Error('历史分组需要完整消息与逐条 token 计数');
 const groups=[];let current=null,ordinal=0;
 for(const [index,message] of messages.entries()){
  if(!message||typeof message!=='object')throw Error('历史消息格式无效');
  if(user(message,format)){
   const anchor=message.extra?.fields_anchor??message.anchor??anchors[ordinal];ordinal++;
   current={anchor:typeof anchor==='string'&&anchor?anchor:null,start:index,end:index+1,tokens:0,messages:[],opening:false};groups.push(current);
  }
  if(!current){current={anchor:null,start:0,end:0,tokens:0,messages:[],opening:true};groups.push(current);}
  current.messages.push(message);current.end=index+1;current.tokens+=tokenCounts[index];
 }
 const seen=new Set();
 for(const group of groups){
  if(group.anchor&&seen.has(group.anchor))throw Error('历史回合锚点重复');if(group.anchor)seen.add(group.anchor);
  const last=group.messages.at(-1);
  group.closed=!group.opening&&(format==='host'?!last.is_user&&!last.is_system&&!last.extra?.tool_invocations: last.role==='assistant'&&!last.tool_calls?.length);
  group.toolsComplete=completeToolChain(group.messages,format);
  // Exclude volatile UI/review extras while detecting changes to actual text,
  // roles, tools and invalidation markers. Digest survives reload and copying.
  group.fingerprint=await fingerprint(group.messages.filter(message=>format==='host'?!message.is_system&&!message.extra?.tool_invocations:message.role!=='tool'&&!message.tool_calls?.length).map(message=>({
   role:format==='host'?(message.is_user?'user':message.is_system?'system':'assistant'):message.role,
   text:format==='host'?message.mes:message.content,invalidated:message.extra?.fields_invalidated===true,
  })));
  group.invalidated=group.messages.some(message=>message.extra?.fields_invalidated===true);
 }
 return groups;
}

const covered=(group,coverage)=>{
 const row=coverage?.anchors?.[group.anchor];
 return Boolean(group.anchor&&group.closed&&group.toolsComplete&&!group.invalidated&&row?.processed===true&&row.indexed===true&&row.complete===true&&row.fingerprint===group.fingerprint);
};

export function planHistoryWindow(groups,{cursor=null,coverage=null,contextTokens,reservedTokens=0,threshold=.85,dropRatio=.3,minRecentGroups=8}={}){
 if(!Array.isArray(groups)||!finite(contextTokens)||!contextTokens||!finite(reservedTokens)||reservedTokens>=contextTokens||!(threshold>0&&threshold<1)||!(dropRatio>0&&dropRatio<1)||!Number.isInteger(minRecentGroups)||minRecentGroups<1)throw Error('历史窗口预算或保留配置无效');
 if(groups.some(g=>!Array.isArray(g.messages)||!finite(g.tokens)||typeof g.fingerprint!=='string'))throw Error('历史窗口缺少分组计数或摘要');
 const turns=groups.filter(group=>!group.opening),opening=groups.filter(group=>group.opening);
 let oldRemoved=cursor?.version===1?cursor.removed??[]:[],reset=false;
 for(const [index,old] of oldRemoved.entries()){
  const group=turns[index];
  if(!group||old.anchor!==group.anchor||old.fingerprint!==group.fingerprint||!covered(group,coverage)){oldRemoved=[];reset=true;break;}
 }
 const removed=turns.slice(0,oldRemoved.length),remaining=turns.slice(oldRemoved.length);
 const openingTokens=opening.reduce((sum,g)=>sum+g.tokens,0),beforeTokens=reservedTokens+openingTokens+remaining.reduce((sum,g)=>sum+g.tokens,0);
 const softLimit=contextTokens*threshold;
 let reason='stable',batch=null;
 if(beforeTokens>=softLimit){
  const maximum=Math.max(0,remaining.length-minRecentGroups),target=Math.ceil(remaining.reduce((sum,g)=>sum+g.messages.length,0)*dropRatio);
  const candidates=[];let messages=0;
  for(const group of remaining.slice(0,maximum)){
   if(!covered(group,coverage)){reason='coverage-required';break;}
   candidates.push(group);messages+=group.messages.length;
   if(messages>=target)break;
  }
  if(candidates.length&&messages>=target){
   removed.push(...candidates);remaining.splice(0,candidates.length);reason='batch-trimmed';
   batch={anchors:candidates.map(g=>g.anchor),messages,tokens:candidates.reduce((sum,g)=>sum+g.tokens,0),coverageReference:coverage.reference??null};
  }else if(reason!=='coverage-required')reason='recent-history-protected';
 }
 const retained=groups.filter(group=>group.opening||remaining.includes(group)),afterTokens=reservedTokens+retained.reduce((sum,g)=>sum+g.tokens,0);
 const nextCursor={version:1,removed:removed.map(g=>({anchor:g.anchor,fingerprint:g.fingerprint})),batches:(reset?0:cursor?.batches??0)+(batch?1:0)};
 return {reason,reset,batch,cursor:nextCursor,removed,retained,messages:retained.flatMap(group=>group.messages),
  beforeTokens,afterTokens,softLimit,withinBudget:afterTokens<=contextTokens,
  needsCoverage:reason==='coverage-required',canSend:afterTokens<=contextTokens};
}
