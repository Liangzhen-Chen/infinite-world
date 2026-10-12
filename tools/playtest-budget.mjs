import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {atomicJSON,digest} from '../server-plugin/storage.mjs';

const amount=value=>Number.isFinite(value)&&value>=0;
const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value)&&!['__proto__','prototype','constructor'].includes(value);
const rates=Object.freeze({hit:.04,miss:2,output:8});
export function budgetUpperProof({oldSpentYuan,oldReservedYuan,legacyYuan,content,extraYuan=0,newLimitYuan=8}){
 if(![oldSpentYuan,oldReservedYuan,legacyYuan,extraYuan,newLimitYuan].every(amount)||newLimitYuan<=0||!Array.isArray(content)||!content.length)throw Error('完整预算金额缺失，拒绝发送');
 for(const row of content)if(!amount(row.spentYuan)||!amount(row.reservedYuan)||typeof row.hash!=='string'||!/^[a-f0-9]{64}$/.test(row.hash))throw Error('预算来源/hash/金额缺失，拒绝发送');
 const roundUpperYuan=oldSpentYuan+oldReservedYuan+legacyYuan+newLimitYuan;
 const contentUpperYuan=content.reduce((n,row)=>n+(row.shared?20:row.spentYuan+row.reservedYuan),0);
 if(content.filter(row=>row.shared).length!==1||content.some(row=>row.shared&&row.spentYuan+row.reservedYuan>20+1e-12))throw Error('共享内容20元上界不完整');
 const goalUpperYuan=roundUpperYuan+contentUpperYuan+extraYuan;
 if(roundUpperYuan>30+1e-12||goalUpperYuan>100+1e-12)throw Error('保守试玩/goal预算超限，拒绝发送');
 return {budgetUpperSafe:true,roundUpperYuan,goalUpperYuan,contentUpperYuan,newLimitYuan};
}
export async function readOptional(file,fallback=null){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;return fallback;}}
export function requestCeiling(body){
 const request={model:'deepseek-flash',max_tokens:1800,stream:false,thinking:{type:'disabled'},...body};
 if(request.model!=='deepseek-flash'||request.stream||!Number.isInteger(request.max_tokens)||request.max_tokens<=0)throw Error('试玩预算只支持 Flash 非流式及明确输出上限');
 if(request.messages)request.messages=request.messages.map(m=>m.role==='assistant'&&m.content===undefined?{...m,content:null}:m);
 return (Buffer.byteLength(JSON.stringify(request))*rates.miss+request.max_tokens*rates.output)/1e6;
}
function measuredCost(response){
 const usage=response.usage??response.measurement?.usage;
 if(!usage||!Number.isInteger(usage.prompt_tokens)||usage.prompt_tokens<0||!Number.isInteger(usage.completion_tokens)||usage.completion_tokens<0)throw Error('模型缺少可核验用量，保留预留');
 const hit=usage.prompt_cache_hit_tokens??usage.prompt_tokens_details?.cached_tokens??0,miss=usage.prompt_cache_miss_tokens??usage.prompt_tokens-hit;
 if(!Number.isInteger(hit)||!Number.isInteger(miss)||hit<0||miss<0||hit+miss!==usage.prompt_tokens)throw Error('缓存用量不一致，保留预留');
 const cost=(hit*rates.hit+miss*rates.miss+usage.completion_tokens*rates.output)/1e6;
 if(response.measurement?.costUpperYuan!==undefined&&Math.abs(response.measurement.costUpperYuan-cost)>1e-10)throw Error('measurement 与用量费用不一致');
 return cost;
}
const role=label=>label.startsWith('consistency-rewrite:')?'rewrite':label.startsWith('consistency:')?'consistency':label.startsWith('npc-autonomy:')?'planning':label.includes('blind')?'blind':label.includes('review')||label.includes('acceptance')?'review':'host';

// The registry is independent of report destinations. The CLI places it in
// git's common directory so worktree changes cannot reset the same run.
export async function openPlaytestBudget({registryDir,runId,cardId,increment,client,runDir,identity,legacyReport=null,beforeReserve=null,requireResponseId=false}){
 if(!safeId(runId)||!safeId(cardId)||!amount(increment)||increment<=0||increment>30)throw Error('须明确 run-id/card/increment；增量最多30元');
 const directory=path.join(path.resolve(registryDir),runId),file=path.join(directory,'budget.json'),lock=path.join(directory,'run.lock');
 await fs.mkdir(directory,{recursive:true});
 const owner={pid:process.pid,token:randomUUID()};
 async function acquire(){
  try{const handle=await fs.open(lock,'wx');try{await handle.writeFile(JSON.stringify(owner));await handle.sync();}finally{await handle.close();}}
  catch(error){
   if(error.code!=='EEXIST')throw error;
   const old=await readOptional(lock);if(!old||!Number.isInteger(old.pid)||old.pid<=0)throw Error('试玩预算锁无法核验');
   try{process.kill(old.pid,0);}catch(e){if(e.code!=='ESRCH')throw e;
    // Stale locks are reclaimed only once; a concurrent owner wins wx.
    const current=await readOptional(lock);if(current?.token!==old.token)throw Error('试玩预算锁已改变');
    await fs.unlink(lock);return acquire();
   }
   throw Error('同一试玩 run 正在使用');
  }
 }
 await acquire();let queue=Promise.resolve(),ledger;
 const release=async()=>{if((await readOptional(lock))?.token===owner.token)await fs.unlink(lock);};
 const mutate=operation=>{const pending=queue.then(operation);queue=pending.catch(()=>{});return pending;};
 try{
  ledger=await readOptional(file);
  if(!ledger){
   const old=runDir&&await readOptional(path.join(runDir,'真实试玩.json'));
   if(old&&!legacyReport)throw Error('报告目录已有历史试玩，须明确核验费用接续，拒绝新建空账');
   ledger={version:1,kind:'playtest',runId,waveLimitYuan:30,spentYuan:0,reservedYuan:0,cards:{},requests:{},responseIds:{},destinations:[],identity};
   if(legacyReport){
    // Import a saved aggregate, never rewrite its original report or logs.
    // Unmeasured/unknown requests require an explicit conservative reserve.
    const {report,reservedYuan}=legacyReport;
    if(!report||!amount(report.costUpperYuan)||report.limitYuan!==30||!amount(reservedYuan)||!report.complete&&reservedYuan===0)throw Error('历史报告费用或未知请求上界无法核验');
    if(report.runId&&report.runId!==runId)throw Error('历史试玩 run-id 不匹配');
    ledger.spentYuan=report.costUpperYuan;ledger.reservedYuan=reservedYuan;
    ledger.legacy={report:structuredClone(report),sourceHash:digest(report),reservedYuan};
    ledger.cards[cardId]={limitYuan:increment,spentYuan:ledger.spentYuan,reservedYuan};
   }
  }
  if(ledger.version!==1||ledger.kind!=='playtest'||ledger.runId!==runId||ledger.waveLimitYuan!==30||digest(ledger.identity)!==digest(identity))throw Error('试玩身份/提示源/场景配置改变，拒绝混账续跑');
  if(legacyReport&&ledger.legacy?.sourceHash!==digest(legacyReport.report))throw Error('历史费用接续证据改变');
  if(!amount(ledger.spentYuan)||!amount(ledger.reservedYuan)||Object.values(ledger.cards).some(c=>!amount(c.spentYuan)||!amount(c.reservedYuan)||!amount(c.limitYuan)))throw Error('试玩账金额无效');
  const cards=Object.values(ledger.cards);
  if(Math.abs(cards.reduce((n,c)=>n+c.spentYuan,0)-ledger.spentYuan)>1e-10||Math.abs(cards.reduce((n,c)=>n+c.reservedYuan,0)-ledger.reservedYuan)>1e-10)throw Error('试玩波次与单卡账不一致');
  if(ledger.legacy){
   const binding=path.join(path.resolve(registryDir),`legacy-${ledger.legacy.sourceHash}.json`);
   try{const handle=await fs.open(binding,'wx');try{await handle.writeFile(JSON.stringify({runId}));await handle.sync();}finally{await handle.close();}}
   catch(error){if(error.code!=='EEXIST')throw error;if((await readOptional(binding))?.runId!==runId)throw Error('历史费用已绑定其他 run-id，拒绝另领波次额度');}
  }
  if(ledger.cards[cardId]&&ledger.cards[cardId].limitYuan!==increment)throw Error('同一卡增量授权已改变');
  ledger.cards[cardId]??={limitYuan:increment,spentYuan:0,reservedYuan:0};
  if(runDir){const report=await readOptional(path.join(runDir,'真实试玩.json'));if(report&&report.runId!==runId&&digest(report)!==ledger.legacy?.sourceHash)throw Error('报告目录属于其他或未知试玩波次');
   if(!ledger.destinations.includes(path.resolve(runDir)))ledger.destinations.push(path.resolve(runDir));}
  await atomicJSON(file,ledger);
 }catch(error){await release();throw error;}
 async function performGenerate(body,label='host',requestId=digest([runId,cardId,body,label])){
  const key=digest([body,label]);let row;
  const cached=await mutate(async()=>{
   if(ledger.blocked)throw Error(`试玩预算已冻结：${ledger.blocked}`);
   row=ledger.requests[requestId];
   if(row){if(row.key!==key||row.card!==cardId)throw Error('恢复模型请求身份改变');if(row.status==='settled')return structuredClone(row.response);if(row.attempts.length>=2)throw Error('同一失败请求已重跑一次');}
   const ceiling=requestCeiling(body),card=ledger.cards[cardId];
   let envelope=null;
   if(beforeReserve)try{envelope=await beforeReserve({ledger:structuredClone(ledger),ceiling,body,label});}catch(error){ledger.blocked='预算proof拒发：'+error.message;await atomicJSON(file,ledger);throw error;}
   if(ledger.spentYuan+ledger.reservedYuan+ceiling>30+1e-12||card.spentYuan+card.reservedYuan+ceiling>card.limitYuan+1e-12)throw Error('试玩波次或单卡增量费用不足，拒绝发送');
   row??={key,card:cardId,label,role:role(label),request:structuredClone(body),attempts:[]};
   if(row.status==='inflight')throw Error('同一请求正在发送');
   row.attempts.push({reservedYuan:ceiling,status:'reserved',at:new Date().toISOString(),...(envelope?{envelope}: {})});row.status='inflight';ledger.requests[requestId]=row;
   ledger.reservedYuan+=ceiling;card.reservedYuan+=ceiling;await atomicJSON(file,ledger);return null;
  });
  if(cached)return cached;
  const attempt=row.attempts.at(-1);let receivedResponse;
  try{
   const response=receivedResponse=await client.generate(body,label),cost=measuredCost(response);
   if(requireResponseId&&(typeof response.id!=='string'||!response.id))throw Error('模型缺少 responseId，保留预留');
   await mutate(async()=>{
    if(cost>attempt.reservedYuan+1e-12){ledger.blocked='真实用量超出请求预留';throw Error('真实用量超出请求预留，停止');}
    if(response.id&&ledger.responseIds[response.id]&&ledger.responseIds[response.id]!==requestId)throw Error('provider 重复 response id，拒绝再次结算');
    if(response.id)ledger.responseIds[response.id]=requestId;
    ledger.spentYuan+=cost;ledger.reservedYuan-=attempt.reservedYuan;
    const card=ledger.cards[cardId];card.spentYuan+=cost;card.reservedYuan-=attempt.reservedYuan;
    Object.assign(attempt,{status:'settled',costUpperYuan:cost,measurement:response.measurement??{usage:response.usage,costUpperYuan:cost}});
    row.status='settled';row.response=structuredClone(response);await atomicJSON(file,ledger);
   });return response;
  }catch(error){await mutate(async()=>{attempt.status='unknown';attempt.error=error.message;if(error.providerResponse||receivedResponse)attempt.response=structuredClone(error.providerResponse??receivedResponse);if(requireResponseId&&(error.providerResponse||/responseId|用量/.test(error.message)))ledger.blocked=error.message;row.status='unknown';await atomicJSON(file,ledger);});throw error;}
 }
 // A process killed during generate cannot confirm failure or refund usage.
 await mutate(async()=>{for(const row of Object.values(ledger.requests))if(row.status==='inflight'){row.status='unknown';Object.assign(row.attempts.at(-1),{status:'unknown',error:'进程中断，结果未知'});}await atomicJSON(file,ledger);});
 const rejectResponse=(requestId,reason)=>mutate(async()=>{
  const row=ledger.requests[requestId];if(!row||row.status!=='settled')return;
  Object.assign(row.attempts.at(-1),{response:row.response,validationError:reason});row.status='failed';delete row.response;await atomicJSON(file,ledger);
 });
 const inflight=new Set();let closing=false;
 const generate=(...args)=>{if(closing)return Promise.reject(Error('试玩预算已关闭'));const pending=performGenerate(...args);inflight.add(pending);pending.then(()=>inflight.delete(pending),()=>inflight.delete(pending));return pending;};
 return {generate,rejectResponse,directory,file,get spent(){return ledger.spentYuan;},get reserved(){return ledger.reservedYuan;},get ledger(){return structuredClone(ledger);},close:async()=>{closing=true;await Promise.allSettled([...inflight]);await queue;await release();}};
}

// A tape records responses before dependent actions. Re-entry replays successful
// HTTP calls; transport-ambiguous writes require manual resolution rather than
// issuing a second create/execute. Model failures have one durable retry.
export async function openPlaytestTape({file,identity,api,client}){
 await fs.mkdir(path.dirname(file),{recursive:true});
 const tape=await readOptional(file,{version:1,identity,http:[],models:[],failures:[]});
 if(digest(tape.identity)!==digest(identity))throw Error('试玩恢复输入改变');
 let httpIndex=0,modelIndex=0,failed=false;
 const save=()=>atomicJSON(file,tape);
 const confirmedRejection=error=>Number.isInteger(error.httpStatus)&&error.httpStatus>=400&&error.httpStatus<500;
 await save();
 const wrappedApi=async(endpoint,body={})=>{
  if(failed){if(endpoint!=='read'&&endpoint!=='feedback')throw Error('失败后禁止继续写入');return api(endpoint,body);} // runner's failure accounting
  const index=httpIndex++,key=digest([endpoint,body]),old=tape.http[index];
  if(old&&old.key!==key)throw Error('试玩恢复 HTTP 顺序改变');
  if(old?.response)return structuredClone(old.response);
  if(old?.status==='pending'){failed=true;throw Error('HTTP 请求执行结果未知，保留检查点，需核查');}
  if(old?.error){if(!confirmedRejection(old))failed=true;const error=Error(old.error);error.httpStatus=old.httpStatus;throw error;}
  const row={key,endpoint,body,status:'pending'};tape.http[index]=row;await save();
  try{const response=await api(endpoint,body);row.response=response;row.status='complete';await save();return structuredClone(response);}
  catch(error){if(error.httpStatus){row.error=error.message;row.httpStatus=error.httpStatus;row.status=confirmedRejection(error)?'failed':'unknown';await save();}if(!confirmedRejection(error))failed=true;throw error;}
 };
 const wrappedClient={async generate(body,label){
  const index=modelIndex++,key=digest([body,label]),old=tape.models[index];
  if(old&&old.key!==key)throw Error('试玩恢复主持顺序改变');
  if(old?.response)return structuredClone(old.response);
  const row=old??{key,requestId:digest([identity,index,key])};tape.models[index]=row;await save();
  try{row.response=await client.generate(body,label,row.requestId);await save();return structuredClone(row.response);}
  catch(error){failed=true;tape.failures.push({index,error:error.message,at:new Date().toISOString()});await save();throw error;}
 }};
 return {api:wrappedApi,client:wrappedClient,tape,save};
}
