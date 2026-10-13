import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadPromptBundle} from '../../../tools/build-card.mjs';
import {loadHostPromptProcessor} from '../../../tools/host-prompt.mjs';
import {loadHistoryTokenizer} from '../../../tools/m3-history-tokenizer.mjs';
import {createPlaytestServer,runPlaytest} from '../../../tools/playtest-runner.mjs';
import {openPlaytestBudget} from '../../../tools/playtest-budget.mjs';
import {DeepSeekClient} from '../../../tools/deepseek-client.mjs';
import {atomicJSON} from '../../../server-plugin/storage.mjs';
import {beforeReserve,verifyProbe} from './preflight.mjs';
const out=import.meta.dirname,registry='F:/dnd/.git/playtest-runs',runId='m2-recheck-001';
const read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const original=await read(path.join(registry,runId,'budget.json'));
const marker=path.join(out,'probe-retry.json');
try{await fs.access(marker);throw Error('初探已经复测一次');}catch(e){if(e.code!=='ENOENT')throw e;}
const bundle=await loadPromptBundle(),host=await loadHostPromptProcessor('F:/dnd/SillyTavern');
const countTokens=await loadHistoryTokenizer('F:/dnd/SillyTavern');
const scenario=await read(path.resolve(out,'../../../tests/playtests/npc_social.json'));
const client=await openPlaytestBudget({registryDir:registry,runDir:out,runId,cardId:'M2-recheck',increment:8,
 identity:original.identity,beforeReserve,requireResponseId:true,
 client:new DeepSeekClient({budgetYuan:30,logFile:path.join(registry,runId,'usage.jsonl')})});
let server;
try{
 server=await createPlaytestServer({plannerClient:client,directory:path.join(client.directory,'server')});
 const oldCampaign=(await fs.readdir(path.join(client.directory,'server/infinite-fields'))).find(f=>f.startsWith('campaign_'));
 assert.ok(oldCampaign,'原初探存储缺失');
 const old=await server.api('read',{campaignId:oldCampaign});
 const assertion={...scenario.turns[0].assertions[0],pass:old.document.state.location===scenario.turns[0].assertions[0].value,actual:old.document.state.location};
 await atomicJSON(path.join(out,'initial-probe-failure.json'),{verified:false,
  scope:'原初探持久请求/响应及服务器最终存储；位置断言按原规则对持久状态重算，未重新调用模型',
  assertion,campaignId:oldCampaign,document:old.document,ledger:original});
 await atomicJSON(marker,{startedAt:new Date().toISOString(),status:'running',originalFailure:assertion});
 const result=await runPlaytest({scenario:{...scenario,id:'npc_social-probe-r1',requirements:[],turns:scenario.turns.slice(0,1)},
  api:server.api,client,bundle,processMessages:host.process,countTokens,stopOnFailure:true});
 await atomicJSON(marker,{completedAt:new Date().toISOString(),status:'complete',result,ledger:client.ledger});
 await verifyProbe(result,client);
 console.log('初探唯一复测通过；原失败保留。');
}catch(error){console.error(error.stack);process.exitCode=1;}
finally{await server?.close();await client.close();}
