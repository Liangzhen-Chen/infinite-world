import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
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

export function validateConfig(config){
 need(config&&typeof config==='object','缺少配置');
 need(typeof config.model==='string'&&config.model,'配置缺 model');
 for(const key of ['maxTurns','maxSessionUsd','monthlyCapUsd','maxTokens'])need(positive(config[key]),`配置缺 ${key}（正数）`);
 need(Number.isInteger(config.maxTurns),'maxTurns 须为整数');
 const price=config.prices;
 need(price&&positive(price.inputPerMTok)&&positive(price.outputPerMTok),'配置缺 prices.inputPerMTok / outputPerMTok');
 return {retries:3,backoffMs:1000,historyPairs:12,apiVersion:'2023-06-01',apiUrl:'https://api.anthropic.com/v1/messages',...config,
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
export async function monthSpend(ledgerPath,month){
 let text;
 try{text=await fs.readFile(ledgerPath,'utf8');}catch(error){if(error.code==='ENOENT')return 0;throw error;}
 let total=0;
 for(const line of text.split('\n')){
  if(!line.trim())continue;
  const row=JSON.parse(line);
  if(row.month===month&&Number.isFinite(row.usd))total+=row.usd;
 }
 return total;
}
export async function appendLedger(ledgerPath,row){
 await fs.mkdir(path.dirname(ledgerPath),{recursive:true});
 await fs.appendFile(ledgerPath,JSON.stringify(row)+'\n','utf8');
}

const defaultSleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const redact=(text,key)=>{let out=String(text);if(key)out=out.split(key).join('[密钥已隐去]');return out;};
// 429/408/5xx 与网络错误重试（上限 config.retries，指数退避）；其余 4xx 立即失败。
export async function callClaude(body,{config,key,fetchImpl,sleep=defaultSleep}){
 let lastMessage='未知错误';
 for(let attempt=0;attempt<=config.retries;attempt++){
  let response,text;
  try{
   response=await fetchImpl(config.apiUrl,{method:'POST',headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':config.apiVersion},body:JSON.stringify(body)});
   text=await response.text();
  }catch(error){
   lastMessage=`网络错误: ${redact(error.message,key)}`;
  }
  if(response){
   if(response.ok)return JSON.parse(text);
   lastMessage=`Claude API HTTP ${response.status}: ${redact(text,key).slice(0,300)}`;
   const retryable=response.status===429||response.status===408||response.status>=500;
   if(!retryable)throw new Error(lastMessage);
  }
  if(attempt<config.retries)await sleep(config.backoffMs*2**attempt);
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

export async function runPlayer({config:rawConfig,api,fetchImpl=globalThis.fetch,env=process.env,cwd=process.cwd(),runId,seed=null,manifestHash=null,gitHead=null,now=()=>new Date(),sleep=defaultSleep,playerName='试玩者'}={}){
 const config=validateConfig(rawConfig);
 const key=env.CLAUDE_API_KEY;
 need(typeof key==='string'&&key.length>0,'未设置环境变量 CLAUDE_API_KEY，试玩不启动');
 need(typeof api==='function','缺少回合接口 api(endpoint, body)');
 need(typeof runId==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(runId),'须给 runId（字母数字下划线连字符）');
 const outDir=path.resolve(cwd,config.outDir??'.tmp/ptai');
 const ledgerPath=path.resolve(cwd,config.ledgerPath??path.join(outDir,'ledger.jsonl'));
 const tracePath=path.join(outDir,runId,'trace.jsonl');
 await fs.mkdir(path.dirname(tracePath),{recursive:true});
 const trace=row=>fs.appendFile(tracePath,JSON.stringify({ts:now().toISOString(),...row})+'\n','utf8');
 const callApi=(endpoint,body)=>{need(ALLOWED_ENDPOINTS.includes(endpoint),`非回合接口: ${endpoint}`);return api(endpoint,body);};
 if(gitHead===null){
  try{gitHead=execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(here,'../..'),encoding:'utf8'}).trim();}catch{gitHead=null;}
 }
 const driverHash=sha256(await fs.readFile(fileURLToPath(import.meta.url),'utf8')+JSON.stringify(config));
 const tools=anthropicTools(),allowed=new Set(tools.map(row=>row.name)),toolsHash=sha256(JSON.stringify(tools));
 const created=await callApi('create',{character:{name:playerName}});
 const campaignId=created.reference.campaignId;
 let view=await callApi('read',{campaignId});
 const month=monthKey(now());
 let monthTotal=await monthSpend(ledgerPath,month),sessionUsd=0,turns=0,stop=null,toolSeq=0;
 await trace({type:'header',runId,seed,campaignId,initialStateHash:sha256(JSON.stringify(view.document)),initialReference:view.reference,
  gitHead,manifestHash,driverHash,toolsHash,model:config.model,
  limits:{maxTurns:config.maxTurns,maxSessionUsd:config.maxSessionUsd,monthlyCapUsd:config.monthlyCapUsd,maxTokens:config.maxTokens},
  prices:config.prices,month,monthSpentBefore:monthTotal,systemPrompt:SYSTEM_PROMPT});
 const sceneMessage=async()=>{
  const s=await callApi('scene',{campaignId,query:''});
  return {role:'user',content:[{type:'text',text:`你现在所处的场景：\n${JSON.stringify(s.scene)}\n\n接下来你想做什么？`}]};
 };
 const invokeTool=async(tool,args)=>{
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
   const ceiling=costCeiling(body,config);
   if(sessionUsd+ceiling>config.maxSessionUsd){stop='session-cap';break;}
   if(monthTotal+ceiling>config.monthlyCapUsd){stop='monthly-cap';break;}
   turns++;
   const response=await callClaude(body,{config,key,fetchImpl,sleep});
   let usd;
   try{usd=usageCost(response.usage,config.prices);}
   catch(error){await trace({type:'turn',turn:turns,request:body,response,error:error.message});throw error;}
   sessionUsd+=usd;monthTotal+=usd;
   await appendLedger(ledgerPath,{ts:now().toISOString(),month,runId,model:config.model,turn:turns,usage:response.usage,usd});
   const content=Array.isArray(response.content)?response.content:[];
   const executed=[],results=[];
   messages.push({role:'assistant',content});
   for(const call of content.filter(block=>block.type==='tool_use')){
    let result,isError=false;
    try{
     need(allowed.has(call.name),'未注册工具');
     result=await invokeTool(call.name,call.input??{});
    }catch(error){result={ok:false,error:error.message};isError=true;}
    executed.push({tool:call.name,args:call.input,result,isError});
    results.push({type:'tool_result',tool_use_id:call.id,content:JSON.stringify(modelToolResult(result)),...(isError?{is_error:true}:{})});
   }
   await trace({type:'turn',turn:turns,request:body,response,usage:response.usage,usd,sessionUsd,monthTotal,text:textOf(content),calls:executed,minute:view.document?.state?.minute??null});
   if(response.stop_reason==='max_tokens'){stop='output-truncated';break;}
   messages.push(results.length?{role:'user',content:results}:await sceneMessage());
  }
 }catch(error){
  await trace({type:'end',reason:'error',error:redact(error.message,key),turns,sessionUsd,monthTotal});
  throw error;
 }
 stop??='max-turns';
 await trace({type:'end',reason:stop,turns,sessionUsd,monthTotal});
 return {runId,stop,turns,sessionUsd,monthTotal,tracePath,ledgerPath};
}

// 命令行：node tools/ptai/driver.mjs --config <file> --origin http://127.0.0.1:PORT --run-id r1 [--seed N] [--manifest-hash H]
export function parseArgs(argv){
 const out={};
 for(let i=0;i<argv.length;i+=2){
  const k=argv[i];
  need(k?.startsWith('--')&&i+1<argv.length,`参数错误: ${k}`);
  out[k.slice(2)]=argv[i+1];
 }
 return out;
}
export function httpApi(origin,fetchImpl=globalThis.fetch){
 return async(endpoint,body={})=>{
  need(ALLOWED_ENDPOINTS.includes(endpoint),`非回合接口: ${endpoint}`);
  const response=await fetchImpl(`${origin}/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json','Connection':'close'},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok||data.ok===false)throw new Error(data.error??`HTTP ${response.status}`);
  return data;
 };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=parseArgs(process.argv.slice(2));
 const config=JSON.parse(await fs.readFile(args.config??path.join(here,'config.example.json'),'utf8'));
 const overrides={'max-turns':['maxTurns',Number],'max-usd':['maxSessionUsd',Number],'monthly-usd':['monthlyCapUsd',Number],model:['model',String],out:['outDir',String],ledger:['ledgerPath',String]};
 for(const [flag,[key,cast]]of Object.entries(overrides))if(args[flag]!==undefined)config[key]=cast(args[flag]);
 need(args.origin&&args['run-id'],'须给 --origin 与 --run-id');
 const result=await runPlayer({config,api:httpApi(args.origin),runId:args['run-id'],seed:args.seed??null,manifestHash:args['manifest-hash']??null});
 console.log(JSON.stringify({stop:result.stop,turns:result.turns,sessionUsd:result.sessionUsd,monthTotal:result.monthTotal,trace:result.tracePath}));
}
