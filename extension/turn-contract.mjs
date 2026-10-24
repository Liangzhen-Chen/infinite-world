import {isOutOfCharacter} from './prompt.mjs';
import {modelContextProjection} from './turn.mjs';

export function candidateSelectionRequest(preview,playerText,messages=[]){
 const refs=[...(preview.candidates??[]).map(row=>row.ref),'more','clarify','none','no_action'];
 return {messages:[...messages,{role:'system',content:turnFactsPrompt({preview})+'\n①判断类型；②核对事实、缺槽及完整原意；③只选候选引用。近似、不确定选 none，保留创意手段与目的。缺槽选 clarify，查更多选 more；no_action 仅纯闲聊/观察。'},{role:'user',content:playerText}],
  tools:[{type:'function',function:{name:'world_confirm',description:'确认完整原意匹配的引擎候选；都不是进入开放提案。',strict:true,
   parameters:{type:'object',properties:{ref:{type:'string',enum:refs}},required:['ref'],additionalProperties:false}}}],
  tool_choice:{type:'function',function:{name:'world_confirm'}},thinking:{type:'disabled'},stream:false};
}

// Only the engine's frozen shortlist supplies executable arguments. The model
// may select a reference, never submit action ids, slot overrides or effects.
export function selectedCandidateCall(preview,playerText,selection){
 if(!selection||Object.keys(selection).length!==1||typeof selection.ref!=='string')throw Error('确认只接受候选引用，不能自填参数');
 const {ref}=selection;
 if(ref==='none')return {name:'world_act',args:{action:'open:proposal',slots:{intent:playerText}}};
 if(ref==='more')return {name:'world_actions',args:{query:playerText}};
 if(ref==='clarify')return null;
 if(ref==='no_action'){
  if((preview.candidates??[]).some(row=>row.match?.complete)||! /^(?:我)?(?:只)?(?:看看|观察|看一眼|闲聊|你好|谢谢|看天气|看行囊)/.test(playerText.trim()))throw Error('行动请求不能用无行动代替裁决');
  return null;
 }
 const candidate=preview.candidates?.find(row=>row.ref===ref);
 if(!candidate)throw Error('不存在的候选引用');
 if(candidate.match?.input!==playerText||candidate.match?.complete!==true)throw Error('候选未覆盖完整原意，请选都不是进入开放提案');
 if(candidate.missing?.length)throw Error(`候选缺槽：${candidate.missing.join('、')}，请澄清`);
 if(candidate.steps)return {steps:structuredClone(candidate.steps).map(args=>({name:'world_act',args}))};
 return {name:'world_act',args:{action:candidate.id,slots:structuredClone(candidate.slots)}};
}

export async function confirmTurnCandidates({preview,playerText,messages=[],generate,execute,onTools=()=>{},onMeasurement=()=>{},isCurrent=()=>true}){
 const response=await generate(candidateSelectionRequest(preview,playerText,messages),'turn-confirm');
 if(response.measurement)onMeasurement(response.measurement);
 if(!isCurrent())throw Error('回合来源已变化，停止确认');
 const choice=response.choices?.[0],calls=choice?.message?.tool_calls??[];
 if(choice?.finish_reason==='length'||calls.length!==1||calls[0].function?.name!=='world_confirm')throw Error('确认必须完整返回唯一选择函数');
 const selected=selectedCandidateCall(preview,playerText,JSON.parse(calls[0].function.arguments));
 if(!selected)return {status:'pending',ref:JSON.parse(calls[0].function.arguments).ref};
 const toolCalls=[],results=[];let result;
 for(const [index,step] of (selected.steps??[selected]).entries()){
  if(!isCurrent())throw Error('回合来源已变化，停止确认');
  const call={...calls[0],id:`${calls[0].id}-${index}`,function:{name:step.name,arguments:JSON.stringify(step.args)}};
  result=await execute(step.name,step.args,call);toolCalls.push(call);
  results.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(modelContextProjection(result))});
  if(result?.ok===false||result?.receipt?.status==='rejected')break;
 }
 const assistant={role:'assistant',content:null,tool_calls:toolCalls};
 await onTools(assistant,results);
 return {status:'executed',assistant,results,result};
}

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
   const confirmed=await confirmTurnCandidates({preview:evidence.preview??{candidates:evidence.candidates??[]},playerText,messages,generate,execute,onTools,onMeasurement,isCurrent});
   assertCurrent();evidence=await gate();
   if(confirmed.status==='executed'&&evidence.status!=='pending'&&narrate){
    retry.calls++;
    const narration=await generate({messages:[...messages,confirmed.assistant,...confirmed.results,{role:'system',content:turnFactsPrompt(evidence)}],tool_choice:'none',thinking:{type:'disabled'},stream:false},'turn-retry-narration');
    if(narration.measurement)onMeasurement(narration.measurement);
    assertCurrent();const final=narration.choices?.[0];
    if(final?.finish_reason==='length'||final?.message?.tool_calls?.length||!final?.message?.content)throw Error('Incomplete narration');
    text=final.message.content;
   }else text=evidence.safeText;
  }catch(error){retry.error=error.message;assertCurrent();evidence=await gate();text=evidence.safeText;}
  finally{retry.latencyMs=Date.now()-started;}
 }
 assertCurrent();const result=await review(text);assertCurrent();
 return {review:result,gate:evidence,text:publishedTurnText(result,evidence),retry};
}
