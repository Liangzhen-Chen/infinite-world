import fs from'node:fs/promises';
import path from'node:path';
import {DeepSeekClient}from'./deepseek-client.mjs';
import {loadPromptBundle}from'./build-card.mjs';
import {createPlaytestServer,runPlaytest}from'./playtest-runner.mjs';
import {atomicJSON}from'../server-plugin/storage.mjs';
import {digest}from'../server-plugin/storage.mjs';
import {loadHostPromptProcessor}from'./host-prompt.mjs';
import {toolSelectionMetrics}from'./playtest-metrics.mjs';
import {reviewPlaytest}from'./playtest-review.mjs';
import {reviewNpcRequirements,summarizeNpcAcceptance}from'./npc-acceptance.mjs';
import * as OpenCC from'opencc-js';
const simplify=OpenCC.Converter({from:'tw',to:'cn'});

const root=path.resolve(import.meta.dirname,'..'),destination=path.join(root,'docs/测试报告/最新');
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const repetitions=Number(option('--repeat','1')),parallel=Number(option('--parallel','4')),only=option('--only','').split(',').filter(Boolean);
if(!Number.isInteger(repetitions)||repetitions<1||repetitions>5||!Number.isInteger(parallel)||parallel<1||parallel>8)throw new Error('试玩重复次数1–5，并发1–8');
const files=(await fs.readdir(path.join(root,'tests/playtests'))).filter(name=>name.endsWith('.json')).sort();
const all=await Promise.all(files.map(async file=>JSON.parse(await fs.readFile(path.join(root,'tests/playtests',file),'utf8'))));
if(only.some(id=>!all.some(row=>row.id===id)))throw new Error('指定会话不存在');
const scenarios=all.filter(row=>!only.length||only.includes(row.id));
for(const scenario of scenarios)if(scenario.turns.length<8||scenario.turns.length>20||scenario.turns.some(row=>!Array.isArray(row.assertions)||!row.assertions.length))throw new Error(`${scenario.id} 不满足8–20回合与逐回合断言`);
const bundle=await loadPromptBundle(),client=new DeepSeekClient({budgetYuan:30,logFile:'logs/playtest-usage.jsonl'});
const host=await loadHostPromptProcessor();
const blocklist=JSON.parse(await fs.readFile(path.join(root,'world/meta/blocklist.json'),'utf8'));
const tasks=scenarios.flatMap(scenario=>Array.from({length:repetitions},(_,index)=>({scenario,attempt:index+1}))),results=[];
const server=await createPlaytestServer({plannerClient:client});let cursor=0,writes=Promise.resolve();
function summary(){const assertions=results.reduce((n,row)=>n+row.assertions,0),passed=results.reduce((n,row)=>n+row.passed,0);
    const complete=results.length===tasks.length,fullCohort=scenarios.length===all.length;
    const required=['L1','L2','L3','L4','L5','L6','L7','T1','T2','T3','T4','T5','T6','G1','G2','G3','C1','C2','V1','V2','V3'];
    const covered=new Set(scenarios.flatMap(row=>row.requirements??[]));
    const missingRequirements=required.filter(id=>!covered.has(id));
    const calls=results.flatMap(row=>row.turns.flatMap(turn=>turn.calls));
    const requests=results.flatMap(row=>row.turns.flatMap(turn=>turn.requests));
    const latencies=requests.map(row=>row.latencyMs).sort((a,b)=>a-b);
    return{
    date:new Date().toISOString(),scope:'真实提示源、正式目录、真实服务器存储与检索；测试夹具非用户存档',complete:results.length===tasks.length,
    targetSessions:tasks.length,completedSessions:results.length,assertions,passed,ledgerRatio:passed/Math.max(1,assertions),
    promptHash:digest(bundle),scenariosHash:digest(scenarios),providerProcessing:host.identity,
    fullCohort,missingRequirements,
    releaseLedgerPass:complete&&fullCohort&&!missingRequirements.length&&assertions>0&&passed===assertions,
    m1ThresholdReached:complete&&fullCohort&&assertions>0&&passed/assertions>=.9,
    calls:{total:calls.length,rejected:calls.filter(call=>call.result?.ok===false).length},
    toolSelection:toolSelectionMetrics(results,scenarios),
    m2:summarizeNpcAcceptance(results,scenarios,repetitions),
    requests:{total:requests.length,medianMs:latencies[Math.floor(latencies.length/2)]??null,p95Ms:latencies[Math.min(latencies.length-1,Math.floor(latencies.length*.95))]??null},
    costUpperYuan:client.spent,limitYuan:30,results};}
async function save(){writes=writes.then(()=>atomicJSON(path.join(destination,'真实试玩.json'),summary()));await writes;}
async function score(result,scenario){
    const visible=result.turns.map(row=>row.visible??'').join('\n');
    result.languageChecks={simplified:simplify(visible)===visible,
        exposedInternals:/world_[a-z]+|(?:npc|item|loc|bld|spell|skill)_[a-z0-9_]+|【场景卡】/.test(visible),
        blockedNames:[...blocklist.names,...blocklist.realPeople].filter(name=>visible.includes(name))};
    result.review=await reviewPlaytest(client,result,scenario.rubric);
    result.npcAcceptance=await reviewNpcRequirements(client,result,scenario);
}
try{
    await save();
    await Promise.all(Array.from({length:Math.min(parallel,tasks.length)},async()=>{
        while(cursor<tasks.length){const{scenario,attempt}=tasks[cursor++];
            console.log(`开始 ${scenario.id} 第${attempt}次`);
            let result;
            try{result=await runPlaytest({scenario,attempt,api:server.api,client,bundle,processMessages:host.process});}
            catch(error){result={id:scenario.id,attempt,assertions:1,passed:0,ratio:0,pass:false,turns:[],error:error.message};}
            try{await score(result,scenario);}catch(error){result.review={...result.review,error:error.message,manualVerified:false};}
            results.push(result);await save();console.log(`${scenario.id} 第${attempt}次 账本 ${result.passed}/${result.assertions}`);
        }
    }));
    const report=summary();await save();
    await atomicJSON(path.join(destination,'真实试玩失败.json'),{date:report.date,scope:report.scope,sessionErrors:results.filter(row=>row.error).map(({id,attempt,error})=>({id,attempt,error})),failures:results.flatMap(result=>result.turns.filter(turn=>turn.errors.length||turn.assertions.some(rule=>!rule.pass)).map(turn=>({session:result.id,attempt:result.attempt,...turn}))),reviews:results.map(row=>({id:row.id,attempt:row.attempt,review:row.review}))});
    console.log(JSON.stringify({...report,results:undefined}));if(!report.releaseLedgerPass)process.exitCode=1;
}finally{await server.close();}
