import {artifactPath} from './tmp-root.mjs';
// P3: test commands retain their reports under the selected run root.
import fs from'node:fs/promises';
import {loadPromptBundle}from'./build-card.mjs';
import {generationSettings}from'../extension/generation.mjs';
import {createPlaytestServer,runPlaytest}from'./playtest-runner.mjs';
import {loadHostPromptProcessor}from'./host-prompt.mjs';
import {DeepSeekClient}from'./deepseek-client.mjs';
import {toolSelectionMetrics}from'./playtest-metrics.mjs';
import {reviewPlaytest}from'./playtest-review.mjs';
import {atomicJSON,digest}from'../server-plugin/storage.mjs';

const configurations=[{id:'off-0.6',temperature:.6,thinking:false},{id:'off-0.8',temperature:.8,thinking:false},{id:'off-1.0',temperature:1,thinking:false},{id:'thinking-low',temperature:.8,thinking:true}];
const scenarios=await Promise.all((await fs.readdir('tests/playtests')).filter(file=>file.endsWith('.json')).sort().map(async file=>JSON.parse(await fs.readFile(`tests/playtests/${file}`,'utf8'))));
const base=await loadPromptBundle(),host=await loadHostPromptProcessor(),seed='settings-r1-v1';
const client=new DeepSeekClient({budgetYuan:30,logFile:'logs/settings-usage.jsonl'}),server=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/,seed});
const tasks=scenarios.flatMap(scenario=>configurations.map(configuration=>({scenario,configuration}))),results=[];
const styleSamples=['lodging','craft'];let cursor=0,writes=Promise.resolve();
const quantile=(values,q)=>{const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*q))]??null;};
function summarize(){return{date:new Date().toISOString(),complete:results.length===tasks.length,scope:`9.7设置对照；每种设置同一${scenarios.length}会话、相同游戏种子，每会话只运行一次；非发布验收`,
    targetSessions:tasks.length,completedSessions:results.length,seed,providerProcessing:host.identity,
    reasoningHistory:'保持安装版酒馆的DeepSeek处理：不保留推理历史，由宿主为工具消息补空reasoning_content',
    promptHash:digest(base),scenariosHash:digest(scenarios),styleSamples,costUpperYuan:client.spent,limitYuan:30,
    configurations:configurations.map(configuration=>{
        const sessions=results.filter(row=>row.configuration===configuration.id),turns=sessions.flatMap(row=>row.turns),requests=turns.flatMap(row=>row.requests);
        const assertions=sessions.reduce((n,row)=>n+row.assertions,0),passed=sessions.reduce((n,row)=>n+row.passed,0);
        const completedTurns=turns.filter(row=>row.operation!=='deleteLast');
        return{...configuration,complete:sessions.length===scenarios.length,sessions:sessions.length,assertions,passed,ratio:assertions?passed/assertions:null,
            toolSelection:toolSelectionMetrics(sessions,scenarios),truncatedTurns:turns.filter(row=>row.finish==='length').length,
            tailValid:turns.filter(row=>row.tail?.valid).length,tailChecks:turns.filter(row=>row.tail).length,
            requests:requests.length,averageRequestsPerTurn:completedTurns.length?requests.length/completedTurns.length:null,
            medianTurnMs:quantile(completedTurns.map(row=>row.latencyMs),.5),p95TurnMs:quantile(completedTurns.map(row=>row.latencyMs),.95),
            gameCostUpperYuan:requests.reduce((n,row)=>n+row.costUpperYuan,0),
            reviewSamples:sessions.filter(row=>row.review).map(row=>({id:row.id,...row.review}))};}),results};}
async function save(){writes=writes.then(()=>atomicJSON(artifactPath('测试报告','最新','设置对照.json'),summarize()));await writes;}
try{
    await save();
    await Promise.all(Array.from({length:8},async()=>{
        while(cursor<tasks.length){
            const{scenario,configuration}=tasks[cursor++],{id,...options}=configuration;
            const bundle={...structuredClone(base),generation:generationSettings(options)};
            console.log(`对照开始 ${id} ${scenario.id}`);
            let result;
            try{result=await runPlaytest({scenario,api:server.api,seed,client,bundle,processMessages:host.process});}
            catch(error){result={id:scenario.id,assertions:1,passed:0,turns:[],error:error.message};}
            result.configuration=id;
            if(styleSamples.includes(scenario.id))result.review=await reviewPlaytest(client,result,scenario.rubric);
            delete result.finalDocument;results.push(result);await save();
            console.log(`对照完成 ${id} ${scenario.id} ${result.passed}/${result.assertions}`);
        }
    }));
    await save();
    await atomicJSON(artifactPath('测试报告','最新','设置对照失败.json'),{date:new Date().toISOString(),failures:results.flatMap(row=>row.error?[{configuration:row.configuration,id:row.id,error:row.error}]:row.turns.filter(turn=>turn.errors.length||turn.assertions.some(rule=>!rule.pass)).map(turn=>({configuration:row.configuration,id:row.id,...turn})))});
    console.log(JSON.stringify({...summarize(),results:undefined,configurations:summarize().configurations.map(row=>({...row,toolSelection:{opportunities:row.toolSelection.opportunities,missed:row.toolSelection.missed,wrong:row.toolSelection.wrong},reviewSamples:row.reviewSamples.map(review=>({id:review.id,complete:review.complete,scores:review.scores}))}))}));
}finally{await server.close();}
