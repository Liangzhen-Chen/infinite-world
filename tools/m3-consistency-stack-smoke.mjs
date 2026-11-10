import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DeepSeekClient} from './deepseek-client.mjs';
import {loadPromptBundle} from './build-card.mjs';
import {loadHostPromptProcessor} from './host-prompt.mjs';
import {createPlaytestServer,runPlaytest} from './playtest-runner.mjs';
import {atomicJSON} from '../server-plugin/storage.mjs';

export async function runConsistencyStackSmoke({client,outputDir='logs/m3-consistency-stack',retryFailed=false}={}){
 await fs.mkdir(outputDir,{recursive:true});const file=path.join(outputDir,'latest.json');
 let prior;try{prior=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(prior?.complete&&(!retryFailed||prior.pass||prior.previousAttempts?.length))return prior;
 client??=new DeepSeekClient({budgetYuan:20,logFile:path.join(outputDir,'usage.jsonl')});client.spent=Math.max(client.spent??0,prior?.costUpperYuan??0);
 const host=await loadHostPromptProcessor(),bundle=await loadPromptBundle(),server=await createPlaytestServer({consistencyClient:client,seed:'m3-stack-paid-bread'});
 const report={date:new Date().toISOString(),complete:false,budgetYuan:20,costUpperYuan:client.spent,method:'真实静态提示、酒馆 DeepSeek 转换、HTTP 交易；保留原模型草稿后可控插入一条与付款相矛盾的句子，用真实审查与文字改写验证。不是自然错误率测量。',providerProcessing:host.identity};
 if(prior?.complete)report.previousAttempts=[prior];
 const narrator={async generate(body,label){
  const response=await client.generate(body,label),choice=response.choices?.[0];
  if(choice?.finish_reason==='stop'&&!choice.message.tool_calls?.length){
   report.generatedDraft=choice.message.content;
   const bad='这次面包没有收钱，两枚铜币退回了你的手里。';
   choice.message.content=String(choice.message.content).replace(/<回合/,`${bad}<回合`);
   report.injectedDraft=choice.message.content;
  }
  report.costUpperYuan=client.spent;await atomicJSON(file,report);return response;
 }};
 try{
  const result=await runPlaytest({scenario:{id:'m3-consistency-stack',initial:{mode:'legacy'},turns:[{input:'我付两枚铜币，向林穗买一个面包，只买这一个，不做其他事情。',assertions:[{kind:'delta',path:'state.player.coins',value:-2},{kind:'quantity',path:'state.inventory.item_bread',value:1}]}]},api:server.api,seed:'m3-stack-paid-bread',client:narrator,bundle,processMessages:host.process});
  report.result=result;const turn=result.turns[0];
  const campaigns=await fs.readdir(path.join(server.directory,'infinite-fields'));
  const campaignId=campaigns.find(name=>name.startsWith('campaign_'));
  const exported=await server.api('export',{campaignId});
  report.eventCounts={trade:exported.events.filter(e=>e.input?.tool==='world_trade').length,tail:exported.events.filter(e=>e.input?.tool==='world_turn').length};
  const reviewDir=path.join(server.directory,'infinite-fields',campaignId,'consistency');
  report.diagnostics=await Promise.all((await fs.readdir(reviewDir)).filter(name=>name.endsWith('.json')).map(async name=>{
   const record=JSON.parse(await fs.readFile(path.join(reviewDir,name),'utf8'));return {token:record.token,playerText:record.playerText,evidence:record.evidence,result:record.result,rewrite:record.rewrite};
  }));
  report.pass=result.pass&&turn.calls.filter(c=>c.tool==='world_trade'&&c.result.ok!==false).length===1&&turn.consistency?.rewritten===true&&turn.consistency?.verified===true&&report.eventCounts.trade===1&&report.eventCounts.tail===1;
  report.complete=true;
 }catch(error){report.error=error.message;report.complete=true;report.pass=false;}
 finally{report.costUpperYuan=client.spent;await atomicJSON(file,report);await server.close();}
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=await runConsistencyStackSmoke({retryFailed:process.argv.includes('--retry-failed')});console.log(JSON.stringify({pass:report.pass,complete:report.complete,costUpperYuan:report.costUpperYuan,eventCounts:report.eventCounts,review:report.result?.turns[0]?.consistency?.status,error:report.error??report.result?.turns[0]?.errors}));if(!report.pass)process.exitCode=1;
}
