import fs from'node:fs/promises';
import path from'node:path';
import {DeepSeekClient}from'./deepseek-client.mjs';
import {loadPromptBundle}from'./build-card.mjs';
import {createPlaytestServer,runPlaytest}from'./playtest-runner.mjs';
import {atomicJSON}from'../server-plugin/storage.mjs';
import {digest}from'../server-plugin/storage.mjs';
import {loadHostPromptProcessor}from'./host-prompt.mjs';
import {toolSelectionMetrics,playtestAcceptance,playtestExitCode}from'./playtest-metrics.mjs';
import {reviewPlaytest}from'./playtest-review.mjs';
import {reviewNpcRequirements,summarizeNpcAcceptance}from'./npc-acceptance.mjs';
import * as OpenCC from'opencc-js';
import {execFile}from'node:child_process';
import {promisify}from'node:util';
import {pathToFileURL}from'node:url';
import {loadHistoryTokenizer}from'./m3-history-tokenizer.mjs';
import {openPlaytestBudget,openPlaytestTape,readOptional}from'./playtest-budget.mjs';
const simplify=OpenCC.Converter({from:'tw',to:'cn'});

const root=path.resolve(import.meta.dirname,'..');
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
for(const name of ['--run-dir','--run-id','--card','--increment'])if(!option(name))throw Error(`真实试玩须明确 ${name}，不能重新领取默认30元`);
const destination=path.resolve(root,option('--run-dir')),runId=option('--run-id'),cardId=option('--card'),increment=Number(option('--increment'));
const resume=args.includes('--resume');
const retestOnly=option('--retest-only','').split(',').filter(Boolean);
if(retestOnly.length&&!resume)throw Error('真实失败复测须明确 --resume，沿同run保留原失败');
const repetitions=Number(option('--repeat','1')),parallel=Number(option('--parallel','4')),only=option('--only','').split(',').filter(Boolean);
const milestone=option('--milestone','');
if(!['','M2'].includes(milestone))throw new Error('当前专项验收支持 --milestone M2；省略则使用完整发布账本门槛');
if(!Number.isInteger(repetitions)||repetitions<1||repetitions>5||!Number.isInteger(parallel)||parallel<1||parallel>8)throw new Error('试玩重复次数1–5，并发1–8');
const files=(await fs.readdir(path.join(root,'tests/playtests'))).filter(name=>name.endsWith('.json')).sort();
const all=await Promise.all(files.map(async file=>JSON.parse(await fs.readFile(path.join(root,'tests/playtests',file),'utf8'))));
if(only.some(id=>!all.some(row=>row.id===id)))throw new Error('指定会话不存在');
const scenarios=all.filter(row=>!only.length||only.includes(row.id));
if(retestOnly.some(id=>!scenarios.some(s=>s.id===id)))throw Error('复测必须属于同一原十场');
for(const scenario of scenarios)if(scenario.turns.length<8||scenario.turns.length>20||scenario.turns.some(row=>!Array.isArray(row.assertions)||!row.assertions.length))throw new Error(`${scenario.id} 不满足8–20回合与逐回合断言`);
const bundle=await loadPromptBundle();
const host=await loadHostPromptProcessor(option('--host-installation'));
const countTokens=option('--host-installation')?await loadHistoryTokenizer(option('--host-installation')):null;
const blocklist=JSON.parse(await fs.readFile(path.join(root,'world/meta/blocklist.json'),'utf8'));
const tasks=scenarios.flatMap(scenario=>Array.from({length:repetitions},(_,index)=>({scenario,attempt:index+1}))),results=[];
const common=(await promisify(execFile)('git',['rev-parse','--git-common-dir'],{cwd:root})).stdout.trim();
const registryDir=path.join(path.resolve(root,common),'playtest-runs');
const identity={promptHash:digest(bundle),scenariosHash:digest(scenarios),providerProcessing:host.identity,repetitions,milestone};
const proof=option('--budget-proof')?await import(pathToFileURL(path.resolve(root,option('--budget-proof'))).href):null;
if(proof){await proof.refreshProof();identity.authorization=proof.authorization;}
let legacyReport=null;
if(option('--legacy-report')){
 if(option('--legacy-reserved')===undefined)throw Error('历史费用接续须明确 --legacy-reserved 未知请求上界');
 const legacyFile=path.resolve(root,option('--legacy-report'));
 if(legacyFile===path.join(destination,'真实试玩.json'))throw Error('历史报告须保留，--run-dir 必须使用另一目录');
 legacyReport={report:JSON.parse(await fs.readFile(legacyFile,'utf8')),reservedYuan:Number(option('--legacy-reserved'))};
}
const client=await openPlaytestBudget({registryDir,runDir:destination,runId,cardId,increment,identity,legacyReport,
 beforeReserve:proof?.beforeReserve,requireResponseId:Boolean(proof),
 client:new DeepSeekClient({budgetYuan:30,logFile:path.join(registryDir,runId,'usage.jsonl')})});
await fs.mkdir(destination,{recursive:true});
const taskDirectory=path.join(client.directory,'tasks');await fs.mkdir(taskDirectory,{recursive:true});
let server,cursor=0,writes=Promise.resolve();
function summary(){const assertions=results.reduce((n,row)=>n+row.assertions,0),passed=results.reduce((n,row)=>n+row.passed,0);
    const complete=results.length===tasks.length,fullCohort=scenarios.length===all.length;
    const required=['L1','L2','L3','L4','L5','L6','L7','T1','T2','T3','T4','T5','T6','G1','G2','G3','C1','C2','V1','V2','V3'];
    const covered=new Set(scenarios.flatMap(row=>row.requirements??[]));
    const missingRequirements=required.filter(id=>!covered.has(id));
    const calls=results.flatMap(row=>row.turns.flatMap(turn=>turn.calls));
    const ledger=client.ledger,modelCalls=Object.values(ledger.requests).flatMap(row=>row.attempts.map(attempt=>({...attempt,role:row.role})));
    const requests=modelCalls.filter(row=>row.measurement).map(row=>row.measurement);
    const latencies=requests.map(row=>row.latencyMs).sort((a,b)=>a-b);
    const report={
    date:new Date().toISOString(),scope:'真实提示源、正式目录、真实服务器存储与检索；测试夹具非用户存档',complete:results.length===tasks.length,
    targetSessions:tasks.length,completedSessions:results.length,assertions,passed,ledgerRatio:passed/Math.max(1,assertions),
    promptHash:digest(bundle),scenariosHash:digest(scenarios),providerProcessing:host.identity,
    fullCohort,missingRequirements,milestone:milestone||'release-ledger',
    releaseLedgerPass:complete&&fullCohort&&!missingRequirements.length&&assertions>0&&passed===assertions,
    m1ThresholdReached:complete&&fullCohort&&assertions>0&&passed/assertions>=.9,
    calls:{total:calls.length,rejected:calls.filter(call=>call.result?.ok===false).length},
    toolSelection:toolSelectionMetrics(results,scenarios),
    m2:summarizeNpcAcceptance(results,scenarios,repetitions),
    requests:{total:modelCalls.length,settled:requests.length,unknown:modelCalls.filter(row=>row.status==='unknown').length,medianMs:latencies[Math.floor(latencies.length/2)]??null,p95Ms:latencies[Math.min(latencies.length-1,Math.floor(latencies.length*.95))]??null},
    runId,cardId,incrementLimitYuan:increment,budgetFile:client.file,
    modelRoles:Object.fromEntries([...new Set(modelCalls.map(row=>row.role))].map(role=>[role,{calls:modelCalls.filter(row=>row.role===role).length,costUpperYuan:modelCalls.filter(row=>row.role===role).reduce((n,row)=>n+(row.costUpperYuan??row.reservedYuan),0)}])),
    spentYuan:client.spent,costUpperYuan:client.spent+client.reserved,reservedYuan:client.reserved,limitYuan:30,results};
    report.acceptancePass=playtestAcceptance(report);
    return report;}
async function save(){writes=writes.then(()=>atomicJSON(path.join(destination,'真实试玩.json'),summary()));await writes;}
async function score(result,scenario){
    const visible=result.turns.map(row=>row.visible??'').join('\n');
    result.languageChecks={simplified:simplify(visible)===visible,
        exposedInternals:/world_[a-z]+|(?:npc|item|loc|bld|spell|skill)_[a-z0-9_]+|【场景卡】/.test(visible),
        blockedNames:[...blocklist.names,...blocklist.realPeople].filter(name=>visible.includes(name))};
    const scoringRequests=new Map(),scoringClient={generate(body,label){const id=digest([runId,cardId,body,label]);scoringRequests.set(label,id);return client.generate(body,label,id);}};
    result.review=await reviewPlaytest(scoringClient,result,scenario.rubric);
    result.npcAcceptance=await reviewNpcRequirements(scoringClient,result,scenario);
    // Only incomplete/invalid reviews become eligible for one explicit resume.
    // Completed unfavorable judgements remain saved; a resume cannot reroll them.
    const failed=[...(result.review.parts??[]).filter(part=>part.error).map(part=>({label:`${result.id}-${result.attempt}-review-${part.start}`,error:part.error})),
        ...(result.review.voiceBlind?.error?[{label:`${result.id}-${result.attempt}-voice-blind`,error:result.review.voiceBlind.error}]:[]),
        ...(result.npcAcceptance?.parts??[]).filter(part=>!part.complete).map(part=>({label:`${result.id}-${result.attempt}-npc-acceptance-${part.id}`,error:part.error}))];
    for(const part of failed)if(scoringRequests.has(part.label))await client.rejectResponse(scoringRequests.get(part.label),part.error);
}
try{
    server=await createPlaytestServer({plannerClient:client,directory:path.join(client.directory,'server')});
    if(proof&&!await readOptional(path.join(path.dirname(path.resolve(root,option('--budget-proof'))),'initial-probe.json'))){
        const initial=scenarios.find(s=>s.id==='npc_social')??scenarios[0];
        const result=await runPlaytest({scenario:{...initial,id:initial.id+'-probe',requirements:[],turns:initial.turns.slice(0,1)},api:server.api,client,bundle,processMessages:host.process,countTokens,stopOnFailure:true});
        await proof.verifyProbe(result,client);console.log('初探正式源/账本100%通过；继续同run新增累计≤8元');
    }
    // Reports are projections of durable tasks, never the source of resume state.
    for(const {scenario,attempt}of tasks){const stored=await readOptional(path.join(taskDirectory,`${digest([cardId,scenario.id,attempt])}.json`));if(stored?.result)results.push(stored.result);}
    await save();
    await Promise.all(Array.from({length:Math.min(parallel,tasks.length)},async()=>{
        while(cursor<tasks.length){const{scenario,attempt}=tasks[cursor++];
            const taskFile=path.join(taskDirectory,`${digest([cardId,scenario.id,attempt])}.json`),task=await readOptional(taskFile,{executions:0,originals:[]});
            if(retestOnly.length&&!retestOnly.includes(scenario.id))continue;
            if(retestOnly.length&&(!task.result||task.result.acceptancePass===true))throw Error('仅已保存的真实失败允许复测');
            if(task.result&&(!resume||task.result.recoveryComplete===true||task.executions>=2))continue;
            if(task.executions&&!resume)throw Error('中断任务须用 --resume 原身份接续');
            if(task.executions>=2)throw Error('同一失败会话已续跑一次');
            if(task.result){task.originals.push(structuredClone(task.result));results.splice(results.findIndex(row=>row.id===scenario.id&&row.attempt===attempt),1);}
            task.executions++;await atomicJSON(taskFile,task);
            console.log(`开始 ${scenario.id} 第${attempt}次`);
            let result;
            try{
                if(!retestOnly.length&&task.gameResult&&!task.gameResult.turns.some(row=>row.errors.length))result=structuredClone(task.gameResult);
                else{
                    const tape=await openPlaytestTape({file:taskFile+(retestOnly.length?'.retest.tape.json':'.tape.json'),identity:{runId,cardId,scenario,attempt,promptHash:identity.promptHash,...(retestOnly.length?{retest:1}:{})},api:server.api,client});
                    result=await runPlaytest({scenario,attempt,api:tape.api,client:tape.client,bundle,processMessages:host.process,countTokens,stopOnFailure:true});
                    task.gameResult=structuredClone(result);await atomicJSON(taskFile,task);
                }
            }
            catch(error){result={id:scenario.id,attempt,assertions:1,passed:0,ratio:0,pass:false,turns:[],error:error.message};}
            try{await score(result,scenario);}catch(error){result.review={...result.review,error:error.message,manualVerified:false};}
            result.originalFailures=task.originals;result.recoveryRuns=task.executions-1;
            result.recoveryComplete=result.acceptancePass===true&&result.turns.length===scenario.turns.length&&result.review?.complete===true&&(!scenario.requirements?.some(id=>id.startsWith('N'))||result.npcAcceptance?.complete===true);
            task.result=result;await atomicJSON(taskFile,task);
            results.push(result);await save();console.log(`${scenario.id} 第${attempt}次 账本 ${result.passed}/${result.assertions}`);
        }
    }));
    const report=summary();await save();
    await atomicJSON(path.join(destination,'真实试玩失败.json'),{date:report.date,scope:report.scope,sessionErrors:results.filter(row=>row.error).map(({id,attempt,error})=>({id,attempt,error})),failures:results.flatMap(result=>result.turns.filter(turn=>turn.errors.length||turn.assertions.some(rule=>!rule.pass)).map(turn=>({session:result.id,attempt:result.attempt,...turn}))),reviews:results.map(row=>({id:row.id,attempt:row.attempt,review:row.review}))});
    console.log(JSON.stringify({...report,results:undefined}));process.exitCode=playtestExitCode(report);
}finally{await server?.close();await client.close();}
