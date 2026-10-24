import {isOutOfCharacter} from './prompt.mjs';
import {modelContextProjection} from './turn.mjs';

export const noActionTool={type:'function',function:{name:'world_no_action',description:'本回合无行动（纯闲聊/纯观察）。只显示已有事实；不执行、不推进时间、不替 NPC 决定。',parameters:{type:'object',properties:{},additionalProperties:false}}};
export function turnFactsPrompt(gate={}){
 return `【本回合来源投影】\n${JSON.stringify(modelContextProjection({status:gate.status,facts:gate.facts??[],settlement:gate.settlement,candidates:gate.candidates??[],preview:gate.preview}))}\n候选尚未执行，不能当成事实；当前状态不是本轮新行动或新决定的回执。`;
}
export function publishedTurnText(review,gate){
 if(review?.safeText!==undefined)return review.safeText;
 if(review?.fallback?.text!==undefined)return review.fallback.text;
 if(review?.canCommit&&typeof review.text==='string')return review.text;
 return gate?.safeText??'本轮叙述尚未验证；已完成的行动保留，请查看事件流。';
}

// One orchestration path for the host and offline runner. Drafts are local
// values; only callers' verified publication may enter persistent history.
export async function finishContractTurn({playerText,draft,gate,review,generate,execute,tools=[],messages=[],onTools=()=>{},onMeasurement=()=>{},onRetryStart=()=>{},isCurrent=()=>true,state={},narrate=true}){
 const assertCurrent=()=>{if(!isCurrent())throw Error('回合来源已变化，停止旧回复');};
 assertCurrent();let evidence=await gate(),text=draft;
 const retry={attempted:false,calls:0,latencyMs:0};
 if(evidence.status==='pending'&&!isOutOfCharacter(playerText)&&generate&&!state.retryStarted){
  state.retryStarted=true;retry.attempted=true;const started=Date.now();
  try{
   await onRetryStart();
   assertCurrent();retry.calls++;
   const response=await generate({messages:[...messages,{role:'system',content:turnFactsPrompt(evidence)+'\n仅补做一次工具阶段；依据玩家原意选择实际工具，纯闲聊/纯观察请选择 world_no_action。不要自动执行预览候选。'}],tools:[...tools,noActionTool],tool_choice:'required',thinking:{type:'disabled'},stream:false},'turn-tool-retry');
   if(response.measurement)onMeasurement(response.measurement);
   assertCurrent();const choice=response.choices?.[0],message=choice?.message;
   if(!message||choice.finish_reason==='length')throw Error('补跑工具阶段未完整返回');
   const calls=message.tool_calls??[];
   if(calls.length){
    // Tool-stage prose is unreviewed too. Keep the actual calls, without it.
    const assistant={role:'assistant',content:null,tool_calls:calls},results=[];
    const noAction=calls.some(call=>call.function?.name===noActionTool.function.name);
    for(const call of calls){
     assertCurrent();let result;
     try{
      const name=call.function?.name,args=JSON.parse(call.function?.arguments??'{}');
      if(name===noActionTool.function.name)result={ok:true,status:'no_action',settled:false};
      else if(noAction)result={ok:false,error:'本回合选择无行动，未执行其他调用'};
      else if(!tools.some(tool=>tool.function.name===name))result={ok:false,error:'补跑调用未注册工具'};
      else result=await execute(name,args,call);
     }catch(error){result={ok:false,error:error.message};}
     results.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)});
    }
    await onTools(assistant,results);assertCurrent();evidence=await gate();
    if(evidence.status!=='pending'&&!noAction&&narrate){
     // A fresh text-only narration follows the executed receipts, before seal.
     retry.calls++;
     const narration=await generate({messages:[...messages,assistant,...results,{role:'system',content:turnFactsPrompt(evidence)+'\n根据实际回执叙述本轮，保留回合尾注；不再调用工具。'}],tool_choice:'none',thinking:{type:'disabled'},stream:false},'turn-retry-narration');
     if(narration.measurement)onMeasurement(narration.measurement);
     assertCurrent();const final=narration.choices?.[0];
     if(final?.finish_reason==='length'||final?.message?.tool_calls?.length||!final?.message?.content)throw Error('补跑后的叙述未完整返回');
     text=final.message.content;
    }else if(evidence.status!=='pending')text=evidence.safeText;
   }
  }catch(error){retry.error=error.message;assertCurrent();evidence=await gate();text=evidence.safeText;}
  finally{retry.latencyMs=Date.now()-started;}
 }
 assertCurrent();const result=await review(text);assertCurrent();
 return {review:result,gate:evidence,text:publishedTurnText(result,evidence),retry};
}
