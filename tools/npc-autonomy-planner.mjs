import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DeepSeekClient} from './deepseek-client.mjs';
import {atomicJSON,digest} from '../server-plugin/storage.mjs';
import {npcPlanningContext} from '../server-plugin/npc-autonomy.mjs';
import {sidebandClient} from '../server-plugin/sideband.mjs';

export const NPC_PLANNER_DEFAULTS=Object.freeze({limit:12,maxCallsPerDay:1,maxTokensPerDay:60000,maxTokens:3000,budgetYuan:20});
const actionFields={craft:['kind','recipe'],audit_inventory:['kind','goal'],trade:['kind','seller','item','quantity'],share:['kind','to','memoryId','channel']};
const string={type:'string',minLength:1,maxLength:180};
const actionSchema={oneOf:Object.entries(actionFields).map(([kind,keys])=>({type:'object',additionalProperties:false,required:keys,properties:Object.fromEntries(keys.map(k=>[k,k==='kind'?{const:kind}:k==='quantity'?{type:'integer',minimum:1,maximum:20}:k==='channel'?{enum:['conversation','carry']}:string]))}))};
function personSchema(npc){
 const actions=structuredClone(actionSchema).oneOf.filter(s=>s.properties.kind.const==='craft'?npc.knownRecipes.length:s.properties.kind.const==='share'?npc.memories.length:s.properties.kind.const==='audit_inventory'?Object.values(npc.goals).flat().some(g=>/核清现有(?:铁料|线料)/.test(g.content)&&g.progress<100):true);
 for(const s of actions){const p=s.properties;if(p.recipe)p.recipe={enum:npc.knownRecipes.map(r=>r.id)};if(p.goal)p.goal={enum:Object.values(npc.goals).flat().filter(g=>/核清现有(?:铁料|线料)/.test(g.content)&&g.progress<100).map(g=>g.id)};if(p.memoryId)p.memoryId={enum:npc.memories.map(m=>m.id)};}
 return {type:'object',additionalProperties:false,required:['npc','actions'],properties:{npc:{const:npc.id},actions:{type:'array',maxItems:npc.intelligence?.maxActions??2,items:{oneOf:actions}}}};
}
function request(context,maxTokens){return {max_tokens:maxTokens,thinking:{type:'disabled'},messages:[
 {role:'system',content:'为当前已登记人物规划离屏行动。逐人只使用本人的人物卡、本人近期记忆、已知配方和地点。其他人物卡中的秘密不代表本人知道。遵守价值观与禁区；不借用玩家财物；不能创造资源、承诺成功或写入事实。只建议已实现的 craft、audit_inventory、trade、share，每人不超过本人 intelligence.maxActions 项，只顾及其 goals 视野内的事；没有现实条件时返回空 actions。craft 只用 knownRecipes；audit_inventory 只可核清本人现有铁料或线料；trade 仅在此刻同一地点向有贸易服务者购买实际库存；share 只传本人 memories 中已有的 memoryId，conversation 必须同地，carry 必须亲自走真实路线。引擎将在开始和完成时另行核验，失败如实拒绝。必须为给定的每个人返回一项。'},
 {role:'user',content:JSON.stringify(context)}],tools:[{type:'function',function:{name:'propose_npc_actions',description:'返回有限的行动建议，由确定性引擎核验后执行',parameters:{type:'object',additionalProperties:false,required:['proposals'],properties:{proposals:{type:'array',minItems:context.people.length,maxItems:context.people.length,items:{oneOf:context.people.map(personSchema)}}}}}}],tool_choice:{type:'function',function:{name:'propose_npc_actions'}}};}
export {request as npcPlanningRequest};
export function validateNpcPlanResponse(response,context){
 const calls=response.choices?.[0]?.message?.tool_calls;
 if(!Array.isArray(calls)||calls.length!==1||calls[0].function?.name!=='propose_npc_actions')throw Error('模型没有返回唯一的规划工具参数');
 const parsed=JSON.parse(calls[0].function.arguments),people=new Map(context.people.map(n=>[n.id,n]));
 if(!parsed||Object.keys(parsed).some(k=>k!=='proposals')||!Array.isArray(parsed.proposals)||parsed.proposals.length!==people.size)throw Error('模型规划人物名单不完整');
 const seen=new Set();
 for(const row of parsed.proposals){
  if(!row||Object.keys(row).some(k=>!['npc','actions'].includes(k))||!people.has(row.npc)||seen.has(row.npc)||!Array.isArray(row.actions)||row.actions.length>(people.get(row.npc).intelligence?.maxActions??2))throw Error('模型规划人物重复、未知或行动超限');seen.add(row.npc);
  for(const action of row.actions){const keys=actionFields[action?.kind];if(!keys||Object.keys(action).some(k=>!keys.includes(k))||keys.some(k=>!(k in action)))throw Error('模型规划含未知行动或改账字段');
   for(const k of keys.filter(k=>!['quantity'].includes(k)))if(typeof action[k]!=='string'||!action[k]||action[k].length>180)throw Error('模型行动字段无效');
   const npc=people.get(row.npc);
   if(action.kind==='craft'&&!npc.knownRecipes.some(r=>r.id===action.recipe))throw Error('模型引用人物未知配方');
   if(action.kind==='audit_inventory'&&!Object.values(npc.goals).flat().some(g=>g.id===action.goal))throw Error('模型引用人物未知目标');
   if(action.kind==='trade'&&(!Number.isSafeInteger(action.quantity)||action.quantity<1||action.quantity>20))throw Error('模型交易数量无效');
   if(action.kind==='share'&&(!['carry','conversation'].includes(action.channel)||!npc.memories.some(m=>m.id===action.memoryId)))throw Error('模型引用人物未知记忆或消息渠道');
  }
 }
 return {kind:'npc-plan',version:1,minute:context.minute,stateFingerprint:context.stateFingerprint,proposals:structuredClone(parsed.proposals)};
}

// The caller stores input in a normal engine transaction. Neither this function
// nor the model is used by replay. One ledger belongs to one campaign.
export async function planNpcAutonomy(engine,document,options={}){
 const config={...NPC_PLANNER_DEFAULTS,...options};
 for(const name of ['maxCallsPerDay','maxTokensPerDay','maxTokens'])if(!Number.isSafeInteger(config[name])||config[name]<1)throw Error(`无效规划配置 ${name}`);
 if(!Number.isFinite(config.budgetYuan)||config.budgetYuan<=0||config.budgetYuan>20)throw Error('规划费用上限须为 0–20 元');
 const context=npcPlanningContext(engine,document,{limit:config.limit}),campaign=digest(document.metadata?.id??document.randomSeed).slice(0,24);
 const ledgerFile=path.resolve(options.ledgerFile??`logs/npc-autonomy/${campaign}.json`),lockFile=`${ledgerFile}.lock`;
 await fs.mkdir(path.dirname(ledgerFile),{recursive:true});let lock;
 try{lock=await fs.open(lockFile,'wx');}catch(error){if(error.code==='EEXIST')return {status:'busy',input:null,reason:'此战役已有规划请求正在处理'};throw error;}
 try{
  let ledger;try{ledger=JSON.parse(await fs.readFile(ledgerFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;ledger={version:1,campaign,spentYuan:0,days:{}};}
  if(ledger.version!==1||ledger.campaign!==campaign||!Number.isFinite(ledger.spentYuan))throw Error('规划预算账本与战役不匹配');
  const day=ledger.days[context.day]??={calls:0,tokens:0,attempts:[]};
  const cached=day.attempts.find(a=>a.status==='ready'&&a.input?.plan.stateFingerprint===context.stateFingerprint);
  if(cached)return {status:'ready',input:structuredClone(cached.input),cached:true,measurement:cached.measurement};
  const body=request(context,config.maxTokens),tokenCeiling=Buffer.byteLength(JSON.stringify(body))+config.maxTokens;
  const costCeiling=(Buffer.byteLength(JSON.stringify(body))*2+config.maxTokens*8)/1e6;
  if(day.calls>=config.maxCallsPerDay||day.tokens+tokenCeiling>config.maxTokensPerDay||ledger.spentYuan+costCeiling>config.budgetYuan)return {status:'limited',input:null,reason:'本游戏日调用、token 或累计费用额度不足',spentYuan:ledger.spentYuan};
  const client=options.client??new DeepSeekClient({budgetYuan:config.budgetYuan,logFile:path.join(path.dirname(ledgerFile),'usage.jsonl')});
  const model=options.sideband?sidebandClient(client,{...options.sideband,role:'npc-planning'}):client;
  if(Number.isFinite(client.budgetYuan))client.budgetYuan=Math.min(client.budgetYuan,(client.spent??0)+config.budgetYuan-ledger.spentYuan);
  const attempt={id:digest([campaign,context.day,day.calls,context.stateFingerprint]).slice(0,24),minute:context.minute,status:'pending',costUpperYuan:costCeiling};
  day.calls++;day.tokens+=tokenCeiling;day.attempts.push(attempt);ledger.spentYuan+=costCeiling;
  await atomicJSON(ledgerFile,ledger);
  try{
   const response=await model.generate(body,`npc-autonomy:${campaign}:day${context.day}`),usage=response.usage;
   if(!usage||!Number.isSafeInteger(usage.prompt_tokens)||!Number.isSafeInteger(usage.completion_tokens))throw Error('模型没有返回可核验 token 用量');
   const measured=response.measurement?.costUpperYuan??(usage.prompt_tokens*2+usage.completion_tokens*8)/1e6;
   if(!Number.isFinite(measured)||measured<0)throw Error('模型费用记录无效');
   day.tokens+=usage.prompt_tokens+usage.completion_tokens-tokenCeiling;ledger.spentYuan+=measured-costCeiling;attempt.costUpperYuan=measured;
   const plan=validateNpcPlanResponse(response,context);attempt.status='ready';attempt.input={type:'npc_plan',plan};attempt.measurement={tokens:usage.prompt_tokens+usage.completion_tokens,costUpperYuan:measured};
   await atomicJSON(ledgerFile,ledger);return {status:'ready',input:structuredClone(attempt.input),cached:false,measurement:attempt.measurement};
  }catch(error){
   attempt.status='failed';attempt.reason=String(error.message).replaceAll(process.env.DEEPSEEK_API_KEY??'__no_key__','[凭据已屏蔽]').slice(0,1200);
   await atomicJSON(ledgerFile,ledger);return {status:'failed',input:null,reason:attempt.reason,spentYuan:ledger.spentYuan};
  }
 }finally{await lock.close();await fs.unlink(lockFile);}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1],stateFile=args.includes('--state')?arg('--state'):null,out=args.includes('--out')?arg('--out'):null;
 if(!stateFile||!out)throw Error('用法：node tools/npc-autonomy-planner.mjs --state 战役快照.json --out 冻结规划.json [--ledger 预算账.json]');
 const [{loadWorld},{WorldEngine}]=await Promise.all([import('./load-world.mjs'),import('../server-plugin/engine.mjs')]);
 const engine=new WorldEngine(await loadWorld()),document=JSON.parse(await fs.readFile(stateFile,'utf8'));
 const result=await planNpcAutonomy(engine,document,{...(args.includes('--ledger')?{ledgerFile:arg('--ledger')}:{})});
 await fs.mkdir(path.dirname(path.resolve(out)),{recursive:true});await atomicJSON(path.resolve(out),result);
 console.log(JSON.stringify({status:result.status,output:path.resolve(out),measurement:result.measurement,reason:result.reason}));if(!['ready','limited'].includes(result.status))process.exitCode=1;
}
