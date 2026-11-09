import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {toolDefinitions,readOnlyTools,modelActionCatalog} from '../../extension/tools.mjs';
import {readStateSection} from '../../extension/state-read.mjs';
import {toolResultWithClock,modelToolResult} from '../../extension/turn.mjs';

// PT-AI：Claude 作开放式玩家。唯一的世界入口是游戏服务端的玩家回合接口
// （与 tools/playtest-runner.mjs 和扩展一致：create/read/scene/actions/search/catalog/execute，
// 其中 execute 即扩展里玩家的工具调用）。模型只看到场景、工具结果与工具清单；
// 没有仓库、文件、shell、测试的访问；也不经 world_turn 叙述尾部（那是主持人的职责，不是玩家的）。
const here=path.dirname(fileURLToPath(import.meta.url));
export const ALLOWED_ENDPOINTS=Object.freeze(['create','read','scene','actions','search','catalog','execute']);
const SYSTEM_PROMPT='你是这个世界里的一名玩家，生活并行动在这片土地上。你按自己的意图行事：想做什么就去做，可以尝试任何你想得到的事。你通过可用的行动与世界互动，并根据看到的结果决定下一步。';
const sha256=text=>createHash('sha256').update(text).digest('hex');
const need=(cond,message)=>{if(!cond)throw new Error(message);};
const positive=value=>Number.isFinite(value)&&value>0;

// 密钥只发往 Anthropic 的固定端点；任何配置都不能改写。
export const API_URL='https://api.anthropic.com/v1/messages';
export function assertApiUrl(value){
 let u;try{u=new URL(value);}catch{throw new Error('apiUrl 非法');}
 need(u.protocol==='https:'&&u.hostname==='api.anthropic.com'&&!u.port&&!u.username&&!u.password&&u.pathname==='/v1/messages'&&!u.search&&!u.hash,'apiUrl 只允许 https://api.anthropic.com/v1/messages');
 return API_URL;
}
// 游戏服务地址只允许本地回环；测试主机须在配置的名单里显式列出（默认空，且必须 https）。
export function assertOrigin(value,allowedHosts=[]){
 let u;try{u=new URL(value);}catch{throw new Error('origin 非法');}
 const loopback=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
 const listed=allowedHosts.includes(u.hostname)&&u.protocol==='https:';
 need((loopback&&['http:','https:'].includes(u.protocol)||listed)&&!u.username&&!u.password&&(u.pathname==='/'||u.pathname==='')&&!u.search&&!u.hash,'origin 只允许本地回环或配置名单内的 https 测试主机');
 return u.origin;
}
export class CapStop extends Error{constructor(reason){super(reason);this.reason=reason;}}
export function validateConfig(config){
 need(config&&typeof config==='object','缺少配置');
 need(typeof config.model==='string'&&config.model,'配置缺 model');
 for(const key of ['maxTurns','maxSessionUsd','monthlyCapUsd','maxTokens'])need(positive(config[key]),`配置缺 ${key}（正数）`);
 need(Number.isInteger(config.maxTurns),'maxTurns 须为整数');
 // 单价按模型 id 索引；所选模型必须有单价，所有单价字段必须是正的有限数（防 NaN 让上限比较恒假）。
 need(config.prices&&typeof config.prices==='object'&&Object.hasOwn(config.prices,config.model),`配置缺 prices[${config.model}]（该模型无单价，拒绝启动）`);
 const price=config.prices[config.model];
 for(const [name,value]of Object.entries(price))need(positive(value),`prices[${config.model}].${name} 须为正的有限数`);
 need(positive(price.inputPerMTok)&&positive(price.outputPerMTok),'配置缺 prices[model].inputPerMTok / outputPerMTok');
 need(typeof config.ledgerPath==='string'&&config.ledgerPath,'配置缺 ledgerPath（账本位置只由配置决定）');
 assertApiUrl(config.apiUrl??API_URL);
 return {retries:3,backoffMs:1000,historyPairs:12,apiVersion:'2023-06-01',testHosts:[],...config,apiUrl:API_URL,
  prices:{cacheWritePerMTok:price.inputPerMTok*1.25,cacheReadPerMTok:price.inputPerMTok,...price}};
}
export function usageCost(usage,prices){
 need(usage&&Number.isInteger(usage.input_tokens)&&Number.isInteger(usage.output_tokens),'响应缺少 usage，无法记账');
 const n=key=>{const v=usage[key]??0;need(Number.isInteger(v)&&v>=0,'响应用量非法，无法记账');return v;};
 return (n('input_tokens')*prices.inputPerMTok+n('output_tokens')*prices.outputPerMTok
  +n('cache_creation_input_tokens')*prices.cacheWritePerMTok+n('cache_read_input_tokens')*prices.cacheReadPerMTok)/1e6;
}
// 发送前的花费上界：输入按 UTF-8 字节/2 估 token（偏高），输出按 maxTokens。
export function costCeiling(body,config){
 const inRate=Math.max(config.prices.inputPerMTok,config.prices.cacheWritePerMTok);
 return (Math.ceil(Buffer.byteLength(JSON.stringify(body))/2)*inRate+config.maxTokens*config.prices.outputPerMTok)/1e6;
}

// 月度账本：只追加的 JSONL，一行一次 API 调用；从不改写、不截断历史。
export function monthKey(date=new Date()){return date.toISOString().slice(0,7);}
// 行只在锁内整行追加。末行若无换行结尾且解析失败，视为崩溃遗留的半行（其预留尚未完成，请求没有发出），忽略；
// 下一次追加会先补换行并给新行打 afterPartial 标记，这样中间的半行只在紧跟标记行时被容忍；
// 其余任何坏行都抛错（宁可停，不可漏记）。
export async function monthSpend(ledgerPath,month){
 let text;
 try{text=await fs.readFile(ledgerPath,'utf8');}catch(error){if(error.code==='ENOENT')return 0;throw error;}
 const lines=text.split('\n'),partialTail=!text.endsWith('\n');
 let total=0,badAt=null;
 for(const [i,line]of lines.entries()){
  if(!line.trim())continue;
  let row;
  try{row=JSON.parse(line);}
  catch(error){
   if(partialTail&&i===lines.length-1)continue;
   if(badAt!==null)throw new Error(`账本第 ${badAt+1} 行损坏，拒绝继续`);
   badAt=i;continue;
  }
  if(badAt!==null){if(row.afterPartial!==true)throw new Error(`账本第 ${badAt+1} 行损坏，拒绝继续`);badAt=null;}
  if(row.month===month&&Number.isFinite(row.usd))total+=row.usd;
 }
 if(badAt!==null)throw new Error(`账本第 ${badAt+1} 行损坏，拒绝继续`);
 return total;
}
// 同一账本的“读合计、检查、预留/修正”在文件锁内完成。设计上同一账本同一时间只允许一个运行实例（多局串行）；
// 锁只是防误并行的保险，不做自动接管：锁文件内容是 pid+令牌+时间，link 原子建立；
// 持有者 pid 存活则等待至 waitMs 后报错；持有者 pid 不存在或锁内容不可解析则立即报错并提示人工确认后删除。
// 释放只删令牌匹配的锁。EEXIST/EPERM/EBUSY/EACCES（Windows 上常是短暂占用）重试至上限。
const pidAlive=pid=>{try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}};
const TRANSIENT=new Set(['EEXIST','EPERM','EBUSY','EACCES']);
async function readLock(lock){
 try{return JSON.parse(await fs.readFile(lock,'utf8'));}catch{return null;}
}
export async function withLock(file,fn,{sleep=defaultSleep,waitMs=30000,link=fs.link,alive=pidAlive}={}){
 await fs.mkdir(path.dirname(file),{recursive:true});
 const lock=file+'.lock',token=`${process.pid}-${randomUUID()}`,tmpFile=`${lock}.${token}.tmp`;
 await fs.writeFile(tmpFile,JSON.stringify({pid:process.pid,token,ts:Date.now()}));
 const deadline=Date.now()+waitMs;
 try{
  for(;;){
   try{await link(tmpFile,lock);break;}
   catch(error){
    if(!TRANSIENT.has(error.code))throw error;
    if(error.code==='EEXIST'){
     const holder=await readLock(lock);
     if(holder===null||!Number.isInteger(holder.pid)||!alive(holder.pid))
      throw new Error(`账本锁已存在且持有者不可确认（${lock}；持有 pid ${holder?.pid??'未知'}；建立于 ${holder?.ts?new Date(holder.ts).toISOString():'未知'}）。不自动接管；确认没有运行中的试玩实例后请手动删除该锁文件`);
    }
    if(Date.now()>=deadline)throw new Error(`账本锁等待超时（${lock}；最后错误码 ${error.code}）`);
    await sleep(10);
   }
  }
  try{return await fn();}
  finally{const held=await readLock(lock);if(held?.token===token)await fs.rm(lock,{force:true});}
 }finally{await fs.rm(tmpFile,{force:true});}
}
export async function appendLedger(ledgerPath,row){
 await fs.mkdir(path.dirname(ledgerPath),{recursive:true});
 let prefix='';
 try{const text=await fs.readFile(ledgerPath,'utf8');if(text&&!text.endsWith('\n')){prefix='\n';row={...row,afterPartial:true};}}catch(error){if(error.code!=='ENOENT')throw error;}
 await fs.appendFile(ledgerPath,prefix+JSON.stringify(row)+'\n','utf8');
}

const defaultSleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const redact=(text,key)=>{let out=String(text);if(key)out=out.split(key).join('[密钥已隐去]');return out;};
// 每次实际发出请求前调用 onAttempt（复核上限并按上界预留一行账本）；
// 收到明确的 HTTP 错误响应（未生成内容、不计费）时 onResult(attempt,{billed:false})；
// 网络错误/超时无法确认是否计费，保留预留。429/408/5xx 与网络错误重试（上限 config.retries，指数退避）。
export async function callClaude(body,{config,key,fetchImpl,sleep=defaultSleep,onAttempt=async()=>null,onResult=async()=>{},onRetry=async()=>{}}){
 assertApiUrl(config.apiUrl);
 let lastMessage='未知错误';
 for(let attempt=0;attempt<=config.retries;attempt++){
  const booked=await onAttempt(body);
  let response,text;
  try{
   response=await fetchImpl(config.apiUrl,{method:'POST',redirect:'error',headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':config.apiVersion},body:JSON.stringify(body)});
   text=await response.text();
  }catch(error){
   lastMessage=`网络错误: ${redact(error.message,key)}`;
  }
  if(response){
   if(response.ok){
    try{return {response:JSON.parse(text),attempt:booked};}
    catch(error){throw new Error(redact(`响应解析失败: ${error.message}`,key));}
   }
   await onResult(booked,{billed:false});
   lastMessage=`Claude API HTTP ${response.status}: ${redact(text,key).slice(0,300)}`;
   const retryable=response.status===429||response.status===408||response.status>=500;
   if(!retryable)throw new Error(lastMessage);
  }
  if(attempt<config.retries){await onRetry({attempt:attempt+1,message:lastMessage});await sleep(config.backoffMs*2**attempt);}
 }
 throw new Error(`${lastMessage}（已重试 ${config.retries} 次）`);
}

const anthropicTools=()=>toolDefinitions().map(row=>({name:row.function.name,description:row.function.description,input_schema:row.function.parameters}));
const textOf=content=>content.filter(block=>block.type==='text').map(block=>block.text).join('\n');
// 保留首条消息，按 (assistant, user) 成对丢弃最旧回合，保持 tool_use/tool_result 配对。
function trimHistory(messages,pairs){
 if(messages.length<=1+pairs*2)return messages;
 return [messages[0],...messages.slice(messages.length-pairs*2)];
}

const pick=(args,props)=>{
 if(!args||typeof args!=='object'||Array.isArray(args))return {};
 return Object.fromEntries(Object.entries(args).filter(([k])=>Object.hasOwn(props,k)));
};

// manifestHash 必须由调用方（门禁）给出：驱动自己算不出“门禁批准的内容”，缺失即拒绝启动。
// seed：create 接口不接受种子（服务端启动时固定），所以只记录调用方声明的 seed 与初态里的 randomSeed。
export async function runPlayer({config:rawConfig,api,fetchImpl=globalThis.fetch,env=process.env,cwd=process.cwd(),runId,seed=null,manifestHash=null,gitHead=null,now=()=>new Date(),sleep=defaultSleep,playerName='试玩者'}={}){
 const config=validateConfig(rawConfig);
 const key=env.CLAUDE_API_KEY;
 need(typeof key==='string'&&key.length>0,'未设置环境变量 CLAUDE_API_KEY，试玩不启动');
 need(typeof manifestHash==='string'&&manifestHash.length>0,'须给门禁 manifest 哈希（--manifest-hash），否则拒绝启动');
 need(typeof api==='function','缺少回合接口 api(endpoint, body)');
 need(typeof runId==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(runId),'须给 runId（字母数字下划线连字符）');
 const outDir=path.resolve(cwd,config.outDir??'.tmp/ptai');
 const ledgerPath=path.resolve(cwd,config.ledgerPath);
 const tracePath=path.join(outDir,runId,'trace.jsonl');
 await fs.mkdir(path.dirname(tracePath),{recursive:true});
 const trace=row=>fs.appendFile(tracePath,JSON.stringify({ts:now().toISOString(),...row})+'\n','utf8');
 const callApi=(endpoint,body)=>{need(ALLOWED_ENDPOINTS.includes(endpoint),`非回合接口: ${endpoint}`);return api(endpoint,body);};
 if(gitHead===null){
  try{gitHead=execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(here,'../..'),encoding:'utf8'}).trim();}catch{gitHead=null;}
 }
 const driverHash=sha256(await fs.readFile(fileURLToPath(import.meta.url),'utf8')+JSON.stringify(config));
 const tools=anthropicTools(),schemaProps=new Map(tools.map(row=>[row.name,row.input_schema.properties??{}])),toolsHash=sha256(JSON.stringify(tools));
 const allowed=new Set(schemaProps.keys());
 const created=await callApi('create',{character:{name:playerName}});
 const campaignId=created.reference.campaignId;
 let view=await callApi('read',{campaignId});
 const month=monthKey(now());
 let sessionUsd=0,turns=0,stop=null,toolSeq=0;
 const monthStart=await monthSpend(ledgerPath,month);
 await trace({type:'header',runId,seed,worldSeed:view.document?.randomSeed??null,campaignId,initialStateHash:sha256(JSON.stringify(view.document)),initialReference:view.reference,
  gitHead,manifestHash,driverHash,toolsHash,model:config.model,
  limits:{maxTurns:config.maxTurns,maxSessionUsd:config.maxSessionUsd,monthlyCapUsd:config.monthlyCapUsd,maxTokens:config.maxTokens},
  prices:config.prices,month,monthSpentBefore:monthStart,systemPrompt:SYSTEM_PROMPT});
 // 每次实际发送都在锁内重读月合计、复核单局与月度上界，并按上界预留一行（只追加）。
 const onAttempt=body=>withLock(ledgerPath,async()=>{
  const ceiling=costCeiling(body,config),total=await monthSpend(ledgerPath,month);
  if(sessionUsd+ceiling>config.maxSessionUsd)throw new CapStop('session-cap');
  if(total+ceiling>config.monthlyCapUsd)throw new CapStop('monthly-cap');
  const id=randomUUID();
  await appendLedger(ledgerPath,{ts:now().toISOString(),month,runId,kind:'reserve',id,model:config.model,usd:ceiling});
  sessionUsd+=ceiling;
  return {id,ceiling};
 });
 const adjust=async(attempt,usd)=>{
  const delta=usd-attempt.ceiling;
  await withLock(ledgerPath,()=>appendLedger(ledgerPath,{ts:now().toISOString(),month,runId,kind:'adjust',id:attempt.id,usd:delta}));
  sessionUsd+=delta;
 };
 const onResult=(attempt,{billed})=>billed===false?adjust(attempt,0):undefined;
 const sceneMessage=async()=>{
  const s=await callApi('scene',{campaignId,query:''});
  return {role:'user',content:[{type:'text',text:`你现在所处的场景：\n${JSON.stringify(s.scene)}\n\n接下来你想做什么？`}]};
 };
 const invokeTool=async(tool,rawArgs)=>{
  const args=pick(rawArgs,schemaProps.get(tool));
  const startMinute=view.document.state.minute;
  if(tool==='world_read')return readStateSection(view.document.state,args.section,args.npc);
  if(tool==='world_search')return callApi('search',{...args,campaignId,expectedSequence:view.reference.sequence});
  if(tool==='world_catalog')return callApi('catalog',{...args,campaignId});
  if(tool==='world_actions')return modelActionCatalog(await callApi('actions',{target:args.target,query:args.query,campaignId,limit:12}));
  need(!readOnlyTools.has(tool),'未知只读工具');
  const eventId=`ptai-${runId}-${turns}-${++toolSeq}`;
  const output=await callApi('execute',{campaignId,tool,args,eventId,anchor:eventId,expectedSequence:view.reference.sequence});
  view=await callApi('read',{campaignId});
  return toolResultWithClock(output.result,{startMinute,minute:view.document.state.minute});
 };
 const messages=[await sceneMessage()];
 try{
  while(turns<config.maxTurns){
   const body={model:config.model,max_tokens:config.maxTokens,
    system:[{type:'text',text:SYSTEM_PROMPT,cache_control:{type:'ephemeral'}}],tools,messages:trimHistory(messages,config.historyPairs)};
   let sent;
   try{sent=await callClaude(body,{config,key,fetchImpl,sleep,onAttempt,onResult,onRetry:row=>trace({type:'retry',turn:turns+1,...row})});}
   catch(error){if(error instanceof CapStop){stop=error.reason;break;}throw error;}
   const {response,attempt}=sent;
   turns++;
   // 响应先落轨迹，再计费、再执行工具：中途崩溃也不丢这一回合的响应。
   await trace({type:'response',turn:turns,request:body,response,usage:response.usage});
   let usd;
   try{usd=usageCost(response.usage,config.prices);}
   catch(error){await trace({type:'error',turn:turns,error:error.message});throw error;}
   await adjust(attempt,usd);
   const monthTotal=await monthSpend(ledgerPath,month);
   const content=Array.isArray(response.content)?response.content:[];
   const executed=[],results=[];
   messages.push({role:'assistant',content});
   for(const call of content.filter(block=>block.type==='tool_use')){
    let result,isError=false;
    try{
     need(allowed.has(call.name),'未注册工具');
     result=await invokeTool(call.name,call.input);
    }catch(error){result={ok:false,error:error.message};isError=true;}
    executed.push({tool:call.name,args:call.input,result,isError});
    results.push({type:'tool_result',tool_use_id:call.id,content:JSON.stringify(modelToolResult(result)),...(isError?{is_error:true}:{})});
   }
   await trace({type:'turn',turn:turns,usage:response.usage,usd,sessionUsd,monthTotal,text:textOf(content),calls:executed,minute:view.document?.state?.minute??null});
   if(response.stop_reason==='max_tokens'){stop='output-truncated';break;}
   messages.push(results.length?{role:'user',content:results}:await sceneMessage());
  }
 }catch(error){
  await trace({type:'end',reason:'error',error:redact(error.message,key),turns,sessionUsd});
  throw error;
 }
 stop??='max-turns';
 const monthTotal=await monthSpend(ledgerPath,month);
 await trace({type:'end',reason:stop,turns,sessionUsd,monthTotal});
 return {runId,stop,turns,sessionUsd,monthTotal,tracePath,ledgerPath};
}

// 命令行：node tools/ptai/driver.mjs --config <file> --origin http://127.0.0.1:PORT --run-id r1 --manifest-hash H [--seed N]
// 账本位置只由配置文件决定，命令行不能改；命令行的数值上限只能调低。
export function parseArgs(argv){
 const out={};
 for(let i=0;i<argv.length;i+=2){
  const k=argv[i];
  need(k?.startsWith('--')&&i+1<argv.length,`参数错误: ${k}`);
  out[k.slice(2)]=argv[i+1];
 }
 return out;
}
// 命令行的数值上限只能把配置调低；非数字会变成 NaN，随后被 validateConfig 拒绝。
export function applyCliLimits(config,args){
 for(const [flag,key]of [['max-turns','maxTurns'],['max-usd','maxSessionUsd'],['monthly-usd','monthlyCapUsd']])
  if(args[flag]!==undefined)config[key]=Math.min(config[key],Number(args[flag]));
 return config;
}
export function httpApi(origin,{fetchImpl=globalThis.fetch,allowedHosts=[]}={}){
 const base=assertOrigin(origin,allowedHosts);
 return async(endpoint,body={})=>{
  need(ALLOWED_ENDPOINTS.includes(endpoint),`非回合接口: ${endpoint}`);
  const response=await fetchImpl(`${base}/${endpoint}`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','Connection':'close'},body:JSON.stringify(body)});
  need(!(response.status>=300&&response.status<400),`拒绝重定向 ${response.status}`);
  const data=await response.json();
  if(!response.ok||data.ok===false)throw new Error(data.error??`HTTP ${response.status}`);
  return data;
 };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=parseArgs(process.argv.slice(2));
 const config=JSON.parse(await fs.readFile(args.config??path.join(here,'config.example.json'),'utf8'));
 applyCliLimits(config,args);
 if(args.model!==undefined)config.model=args.model;
 if(args.out!==undefined)config.outDir=args.out;
 need(args.origin&&args['run-id'],'须给 --origin 与 --run-id');
 const result=await runPlayer({config,api:httpApi(args.origin,{allowedHosts:config.testHosts??[]}),runId:args['run-id'],seed:args.seed??null,manifestHash:args['manifest-hash']??null});
 console.log(JSON.stringify({stop:result.stop,turns:result.turns,sessionUsd:result.sessionUsd,monthTotal:result.monthTotal,trace:result.tracePath}));
}
