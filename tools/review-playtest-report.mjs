import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {DeepSeekClient,normalizeAssistantContent} from './deepseek-client.mjs';
import {atomicJSON} from '../server-plugin/storage.mjs';
import {reviewPlaytest} from './playtest-review.mjs';
import {reviewNpcRequirements,summarizeNpcAcceptance} from './npc-acceptance.mjs';

const root=path.resolve(import.meta.dirname,'..');
export function playtestEvidenceHash(report){
    // Reviews and destination names cannot create a fresh budget for old evidence.
    return createHash('sha256').update(JSON.stringify(report.results.map(({id,attempt,requirements,turns})=>({id,attempt,requirements,turns})))).digest('hex');
}

export async function persistentReviewClient(client,{file,budget,evidenceHash}){
    if(!Number.isFinite(budget)||budget<0||budget>30)throw Error('重评预算必须为0–30元');
    let ledger;
    try{ledger=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
    if(ledger&&(ledger.evidenceHash!==evidenceHash||['spentYuan','reservedYuan','limitYuan'].some(key=>!Number.isFinite(ledger[key])||ledger[key]<0)))throw Error('重评预算账无效');
    const limit=Math.min(budget,ledger?.limitYuan??budget);
    client.budgetYuan=limit;
    client.spent=Math.max(client.spent??0,(ledger?.spentYuan??0)+(ledger?.reservedYuan??0));
    client.reserved=0;
    const save=reservedYuan=>atomicJSON(file,{evidenceHash,spentYuan:client.spent,reservedYuan,limitYuan:limit});
    await save(0);
    let running=false;
    return {
        get spent(){return client.spent;},get budgetYuan(){return limit;},
        async generate(body,label){
            if(running)throw Error('旧报告重评只允许串行请求');
            if(body.tools||body.tool_choice)throw Error('旧报告重评不得调用游戏工具');
            const request={model:'deepseek-flash',max_tokens:1800,stream:false,thinking:{type:'disabled'},...body};
            if(request.messages)request.messages=normalizeAssistantContent(request.messages);
            const rates=client.rates??{miss:2,output:8};
            const ceiling=(Buffer.byteLength(JSON.stringify(request))*rates.miss+request.max_tokens*rates.output)/1e6;
            if(client.spent+ceiling>limit)throw Error(`重评达到${limit}元累计费用上限，已停止`);
            running=true;
            const before=client.spent;
            try{
                // Persist before dispatch: a killed process leaves a charged reservation.
                await save(ceiling);
                const response=await client.generate(body,label);
                const cost=response.measurement?.costUpperYuan;
                client.spent=Math.max(client.spent,before+(Number.isFinite(cost)&&cost>=0?cost:ceiling));
                return response;
            }catch(error){client.spent=Math.max(client.spent,before+ceiling);throw error;}
            finally{try{await save(0);}finally{running=false;}}
        },
    };
}

export async function reassessPlaytestReport(client,report,scenarios,{world}={}){
    if(!Array.isArray(report.results)||!report.results.length)throw Error('输入不是含真实回合results的试玩报告');
    const attempts=new Set();
    for(const result of report.results){
        const key=`${result.id}:${result.attempt}`;
        if(attempts.has(key))throw Error('输入报告包含重复会话');
        attempts.add(key);
        const scenario=scenarios.find(s=>s.id===result.id);
        if(!scenario||!Array.isArray(result.turns)||!result.turns.length)throw Error(`会话缺少已存回合或审核细则：${result.id}`);
        if(JSON.stringify(scenario.requirements??[])!==JSON.stringify(result.requirements??[]))throw Error(`会话编号与原审核细则不一致：${result.id}`);
    }
    const output=structuredClone(report);
    for(const result of output.results){
        const scenario=scenarios.find(s=>s.id===result.id);
        result.reviewHistory=[...(result.reviewHistory??[]),{review:result.review,npcAcceptance:result.npcAcceptance}];
        result.review=await reviewPlaytest(client,result,scenario.rubric??{},{world});
        result.npcAcceptance=await reviewNpcRequirements(client,result,scenario);
    }
    const relevant=scenarios.filter(s=>output.results.some(r=>r.id===s.id));
    const repetitions=report.targetSessions&&report.targetSessions%relevant.length===0?report.targetSessions/relevant.length:1;
    output.m2=summarizeNpcAcceptance(output.results,relevant,repetitions);
    if(report.complete===false||report.targetSessions!==undefined&&report.targetSessions!==report.results.length)output.m2.thresholdReached=false;
    output.reassessment={date:new Date().toISOString(),gameExecuted:false,manualVerified:false,
        scope:'只重评已存真实回合；旧评分原文保留于reviewHistory，不是新增游戏证据',
        complete:output.results.every(r=>r.review.complete&&(!r.npcAcceptance||r.npcAcceptance.complete)),
        cumulativeReviewCostUpperYuan:client.spent,reviewLimitYuan:client.budgetYuan};
    return output;
}

export async function reviewReportCLI(args,{clientFactory=options=>new DeepSeekClient(options),scenarios,world}={}){
    const options={};
    for(let i=0;i<args.length;i+=2){
        if(!['--input','--output','--budget'].includes(args[i])||options[args[i]]!==undefined||!args[i+1])throw Error('用法：--input 旧报告.json --output 新报告.json --budget 累计上限元');
        options[args[i]]=args[i+1];
    }
    if(!options['--input']||!options['--output']||options['--budget']===undefined)throw Error('必须显式指定--input、--output和--budget');
    const input=await fs.realpath(path.resolve(options['--input'])),output=path.resolve(options['--output']),budget=Number(options['--budget']);
    if(output===input)throw Error('输出不得覆盖输入报告');
    if(!Number.isFinite(budget)||budget<0||budget>30)throw Error('重评预算必须为0–30元');
    const report=JSON.parse(await fs.readFile(input,'utf8'));
    if(!Array.isArray(report.results)||!report.results.length)throw Error('输入不是含真实回合results的试玩报告');
    const evidenceHash=playtestEvidenceHash(report),directory=path.join(root,'logs/playtest-review-budget'),ledger=path.join(directory,`${evidenceHash}.json`);
    await fs.mkdir(directory,{recursive:true});await fs.mkdir(path.dirname(output),{recursive:true});
    const lock=await fs.open(`${ledger}.lock`,'wx');
    let destination,reviewed;
    try{
        // wx also refuses existing aliases/hard links and preserves previous failures.
        destination=await fs.open(output,'wx');
        if(!scenarios){
            const directory=path.join(root,'tests/playtests');
            const files=(await fs.readdir(directory)).filter(name=>name.endsWith('.json')).sort();
            scenarios=await Promise.all(files.map(async name=>JSON.parse(await fs.readFile(path.join(directory,name),'utf8'))));
        }
        const client=await persistentReviewClient(clientFactory({budgetYuan:budget,logFile:path.join(directory,`${evidenceHash}.usage.jsonl`)}),{file:ledger,budget,evidenceHash});
        const initialSpent=client.spent;
        reviewed=await reassessPlaytestReport(client,report,scenarios,{world});
        reviewed.reassessment={...reviewed.reassessment,input,evidenceHash,budgetFile:ledger,incrementalCostUpperYuan:client.spent-initialSpent};
        await destination.writeFile(JSON.stringify(reviewed,null,2)+'\n');
    }finally{
        await destination?.close();await lock.close();await fs.unlink(`${ledger}.lock`);
    }
    return reviewed;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    try{
        const report=await reviewReportCLI(process.argv.slice(2));
        console.log(JSON.stringify({reassessment:report.reassessment,m2:report.m2}));
        if(!report.reassessment.complete)process.exitCode=1;
    }catch(error){console.error(error.message);process.exitCode=1;}
}
