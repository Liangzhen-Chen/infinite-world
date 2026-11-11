import fs from 'node:fs/promises';
import path from 'node:path';
import {atomicJSON,digest,applyPatches} from '../server-plugin/storage.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {relationView} from '../server-plugin/npc-state.mjs';
import {runPlaytest,createPlaytestServer} from './playtest-runner.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {loadPromptBundle} from './build-card.mjs';
import {loadHostPromptProcessor} from './host-prompt.mjs';
import {assessSoakTiming} from './m3-soak-timing.mjs';
export {assessSoakTiming} from './m3-soak-timing.mjs';
import {publicConsistencyResult} from '../server-plugin/consistency-service.mjs';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
async function optional(file,fallback){try{return await read(file);}catch(e){if(e.code!=='ENOENT')throw e;return fallback;}}
const category=label=>label.startsWith('player:')?'player':label.startsWith('score:')?'scoring':label.startsWith('consistency-rewrite:')?'rewrite':label.startsWith('consistency:')?'review':label.startsWith('npc')?'planning':'narrator';

// All roles share this durable pre-call reservation, including transport errors.
export async function soakClient(directory,{client,budgetYuan}={}){
 const file=path.join(directory,'all-model-calls.json');await fs.mkdir(directory,{recursive:true});
 const ledger=await optional(file,{version:1,budgetYuan,spentYuan:0,calls:[]});
 if(ledger.budgetYuan!==budgetYuan)throw Error('模型总预算与既有记录不一致');
 client??=new DeepSeekClient({budgetYuan,logFile:path.join(directory,'usage.jsonl')});client.spent=Math.max(client.spent??0,ledger.spentYuan);
 return {ledger,async generate(body,label='narrator'){
  const ceiling=(Buffer.byteLength(JSON.stringify(body))*2+(body.max_tokens??1800)*8)/1e6;
  if(ledger.spentYuan+ceiling>budgetYuan)throw Error('浸泡全部角色调用达到总预算');
  const row={label,role:category(label),runtime:!['player','scoring'].includes(category(label)),status:'pending',costUpperYuan:ceiling};ledger.calls.push(row);ledger.spentYuan+=ceiling;await atomicJSON(file,ledger);
  try{const response=await client.generate(body,label),cost=response.measurement?.costUpperYuan;if(!Number.isFinite(cost)||cost<0)throw Error('模型调用没有可核验费用');
   ledger.spentYuan+=cost-ceiling;Object.assign(row,response.measurement,{status:'complete',role:row.role,runtime:row.runtime});await atomicJSON(file,ledger);return response;
  }catch(error){row.status='failed';row.error=String(error.message).replaceAll(process.env.DEEPSEEK_API_KEY??'__no_key__','[屏蔽]').slice(0,1200);await atomicJSON(file,ledger);throw error;}
 }};
}

// Durable request tape re-enters precisely the existing runner. Responses are
// frozen before their dependent tool calls. Pending writes retain event IDs.
export async function createSoakAdapter({directory,client,budgetYuan=50,bundle,processMessages,countTokens,historyWindow,world,afterHttp,createBody=null}={}){
 directory=path.resolve(directory);await fs.mkdir(path.join(directory,'tasks'),{recursive:true});
 const shared=await soakClient(directory,{client,budgetYuan});bundle??=await loadPromptBundle();
 const server=await createPlaytestServer({world,directory:path.join(directory,'server'),seed:'m3-continuous-soak',plannerClient:shared,consistencyClient:shared});
 async function initialSession(persona){
  const file=path.join(directory,`initial-${persona}.json`),existing=await optional(file,null);if(existing)return existing;
  const created=await server.api('create',createBody??{character:{name:persona==='merchant'?'商旅':'营造者'}});
  const session={campaignId:created.reference.campaignId,chat:[{is_user:false,name:bundle.card.data.name,mes:bundle.card.data.first_mes}],history:[{role:'assistant',content:bundle.card.data.first_mes}],historyCursor:null};await atomicJSON(file,session);return session;
 }
 async function execute(task){
  const file=path.join(directory,'tasks',`${digest(task.id)}.json`),stored=await optional(file,null);
  let tape=stored??{id:task.id,input:task.input,checkpoint:task.checkpoint,calls:[],models:[],failures:[]};
  if(tape.id!==task.id||tape.input!==task.input||digest(tape.checkpoint)!==digest(task.checkpoint))throw Error('续跑输入或会话检查点改变');
  if(tape.result)return structuredClone(tape.result);
  let httpIndex=0,modelIndex=0,poison=null;
  const save=()=>atomicJSON(file,tape);await save();
  const api=async(endpoint,body={})=>{
   if(poison)throw poison;
   const index=httpIndex++,key=digest([endpoint,body]),old=tape.calls[index];
   if(old&&old.key!==key)throw Error('恢复 HTTP 调用顺序发生变化');
   if(old?.response)return structuredClone(old.response);
   if(old?.error)throw Error(old.error);
   const row=old??{key,endpoint,body};tape.calls[index]=row;await save();
   let response;
   try{response=await server.api(endpoint,body);}catch(error){if(error.httpStatus){row.error=error.message;await save();}else poison=error;throw error;}
   try{await afterHttp?.(endpoint,body,response);row.response=response;await save();return structuredClone(response);}catch(error){poison=error;throw error;}
  };
  api.seedMode=server.api.seedMode;
  const narrator={async generate(body,label){
   const index=modelIndex++,key=digest([body,label]),old=tape.models[index];if(old&&old.key!==key)throw Error('恢复主持调用顺序发生变化');
   if(old?.response)return structuredClone(old.response);const row=old??{key};tape.models[index]=row;await save();row.response=await shared.generate(body,label);await save();return structuredClone(row.response);
  }};
  try{
   // Creating an empty campaign cannot transfer resources. Save its reference
   // before the first game action; a crash here can only leave an empty branch.
   if(!tape.session){tape.session=task.checkpoint??await initialSession(task.persona);await save();}
   processMessages??=(await loadHostPromptProcessor()).process;
   const result=await runPlaytest({scenario:{id:task.id,turns:[{input:task.input,anchor:task.id}]},session:tape.session,api,seed:'m3-continuous-soak',client:narrator,bundle,processMessages,countTokens,historyWindow});
   tape.report=result;await save();const turn=result.turns[0];
   if(turn.errors.length||!turn.consistency?.reviewId)throw Error(`回合未验证：${turn.errors.join('；')||turn.consistency?.status}`);
   const records=await read(path.join(directory,'server','infinite-fields',result.session.campaignId,'consistency',`${turn.consistency.reviewId}.json`));
   // The durable review is authoritative. Older tapes may have the former
   // warning-only HTTP flag; retain that raw response and interpret the saved
   // review without asking the model again or altering its issue severities.
   const finalReview=publicConsistencyResult(records);tape.reviewOutcome=finalReview;await save();
   const exported=await api('export',{campaignId:result.session.campaignId});
   const evidence=await deriveSoakEvidence(exported,task.id,task.turn);
   let answers=[];
   if(task.kind==='probe'){
    const response=await narrator.generate({messages:[{role:'system',content:'只从给出的回答逐字摘录答案。输出JSON {answers:[{number:题号整数,answer:数字或简短字符串,quote:回答中完整原文片段}]}。不知道就略过，禁止猜测。'},{role:'user',content:JSON.stringify({questions:task.input,reply:turn.visible??turn.reply})}],response_format:{type:'json_object'},max_tokens:1200,thinking:{type:'disabled'}},`score:${task.id}`);
    const parsed=JSON.parse(response.choices?.[0]?.message?.content??'null');if(!Array.isArray(parsed?.answers))throw Error('评分摘录格式错误');answers=parsed.answers;
   }
   const issues=r=>structuredClone(r?.issues??[]),count=(r,severity)=>issues(r).filter(i=>i.severity===severity).length;
   tape.result={completed:true,pass:result.acceptancePass,originalReply:turn.originalReply,...(turn.reviewFailure?{reviewFailure:turn.reviewFailure}:{}),
    costUpperYuan:0,checkpoint:result.session,eventIds:evidence.eventIds,facts:evidence.facts,timing:assessSoakTiming(evidence.timing,{input:task.input,reply:turn.reply}),
    consistency:{verified:finalReview.verified,status:finalReview.status,canCommit:finalReview.canCommit,feedback:finalReview.feedback,issues:issues(finalReview),rewriteError:finalReview.rewriteError,
     originalErrors:count(records.result.firstReview,'error'),residualErrors:count(records.result.review,'error'),originalWarnings:count(records.result.firstReview,'warning'),residualWarnings:count(records.result.review,'warning'),originalIssues:issues(records.result.firstReview),residualIssues:issues(records.result.review)},text:turn.visible??turn.reply,answers,historyWindow:turn.historyWindow};await save();return structuredClone(tape.result);
  }catch(error){tape.failures.push({error:String(error.message).replaceAll(process.env.DEEPSEEK_API_KEY??'__no_key__','[屏蔽]').slice(0,1200),at:new Date().toISOString()});await save();throw error;}
 }
 return {execute,server,client:shared,bundle,initialSession,close:server.close};
}

export async function deriveSoakEvidence(exported,anchor,turn){
 let document=structuredClone(exported.initial),expected=0,elapsed=0,actionMinutes=0,tailMinutes=0,actionCount=0,startMinute=null;const facts=[],eventIds=[],engines=new Map(),receipts=[];
 for(const event of exported.events){
  if(event.kind==='reconcile')throw Error('浸泡样本包含撤销，需重新建立有效分支样本');
  if(!engines.has(document.worldHash))engines.set(document.worldHash,new WorldEngine(exported.worlds[document.worldHash]));const engine=engines.get(document.worldHash);
  const computed=await engine.reduce(document,event.input,{replay:true,result:event.result}),after=applyPatches(document,computed.patches);
  if(event.anchor===anchor){
   startMinute??=document.state.minute;
   eventIds.push(event.id);expected+=after.state.minute-document.state.minute;
   if(event.input?.tool==='world_turn')tailMinutes+=after.state.minute-document.state.minute;
   else if(event.input?.tool){actionMinutes+=after.state.minute-document.state.minute;actionCount++;}
   const persisted=applyPatches(document,event.patches);elapsed+=persisted.state.minute-document.state.minute;
   const label=engine.formatCalendar(after.state.minute),add=(suffix,category,question,value)=>facts.push({id:`${event.id}:${suffix}`,sourceEvent:event.id,authority:'event-derived',category,question,expected:value});
   const receipt=computed.result??{},name=id=>id==='player'?document.state.player.name??'玩家':engine.byId.get(id)?.name??id;
   if(event.input?.tool&&event.input.tool!=='world_turn'){
    const saved=event.result??{},declared=saved.minutes??saved.elapsed??saved.spent?.minutes;
    receipts.push({eventId:event.id,tool:event.input.tool,args:structuredClone(event.input.args??{}),declaredMinutes:Number.isFinite(declared)?declared:null,
     elapsedMinutes:persisted.state.minute-document.state.minute,source:'persisted-tool-receipt'});
   }
   if(event.input?.tool==='world_trade'&&receipt.item&&Number.isFinite(receipt.quantity)){
    const {item,seller,buyer,quantity}=receipt,buying=buyer==='player',counterparty=buying?seller:buyer,verb=buying?'购买':'售出';
    add('quantity','structured',`${label}与${name(counterparty)}交易${name(item)}，当次${verb}数量是多少？`,quantity);
    add('item','detail',`${label}向${name(counterparty)}${verb}的物品叫什么？`,name(item));
    add('counterparty','detail',`${label}${verb}${name(item)}的交易对方是谁？`,name(counterparty));
   }
   for(const [obligationId,obligation] of Object.entries(after.state.obligations??{})){
    const previous=document.state.obligations?.[obligationId];
    if(![obligation.promisor,obligation.promisee].includes('player')||previous?.status===obligation.status)continue;
    const person=name(obligation.promisor==='player'?obligation.promisee:obligation.promisor);
    add(`promise-${obligationId}`,'structured',`${label}玩家与${person}关于“${obligation.content}”的约定，当时状态是什么？`,obligation.status);
   }
   for(const [npc,npcState] of Object.entries(after.state.npcs??{})){
    if(!document.state.npcs?.[npc])continue;
    const before=relationView(engine,document.state,npc,'player').trust,current=relationView(engine,after.state,npc,'player').trust;
    if(before===current)continue;
    add(`trust-${npc}`,'structured',`${label}这次事件后，${name(npc)}对玩家的信任增加还是减少？`,current>before?'增加':'减少');
   }
   if(after.state.location!==document.state.location)add('arrival','detail',`${label}抵达哪个地点？`,engine.byId.get(after.state.location)?.name??after.state.location);
   if(after.state.player.coins!==document.state.player.coins)add('coins','structured',`${label}这次行动使钱袋${after.state.player.coins>document.state.player.coins?'增加':'减少'}了多少铜？`,Math.abs(document.state.player.coins-after.state.player.coins));
  }
  document=after;
 }
 return {eventIds,facts,timing:{source:'replay',expectedMinutes:expected,elapsedMinutes:elapsed,actionMinutes,tailMinutes,actionCount,startMinute,receipts}};
}
