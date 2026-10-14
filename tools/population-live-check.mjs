#!/usr/bin/env node
// Real-entry check for on-demand population (T143-S5).
//   node tools/population-live-check.mjs            dry run with a local mock, no model, no ledger
//   node tools/population-live-check.mjs --live --count 6
// Live mode drafts and self-checks N Baishi adults through DeepSeek. Hard caps:
// 18 calls and 0.80 yuan (card T143S5 in world/drafts/w1/budget.json, written
// serially through tools/content-budget.mjs). Only DEEPSEEK_API_KEY is used.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {profileBrief,checkGeneratedProfile,acceptPopulationProfile} from '../server-plugin/population.mjs';
import {modelProfileGenerator} from '../server-plugin/population-service.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const LIMITS={maxCalls:18,maxYuan:0.8,maxPeople:6,cardId:'T143S5'};
const args=process.argv.slice(2),flag=name=>args.includes(name),value=(name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback;};

// One adult from each Baishi district, in a throwaway in-memory campaign.
export async function sampleAdults(count){
    const world=await loadWorld(),engine=new WorldEngine(world);
    const seed=JSON.parse(await fs.readFile(path.join(ROOT,'tests/fixtures/legacy/seed.json'),'utf8'));
    let doc=engine.createCharacter(seed,{},'population-live-check');doc.state.location='loc_bs';
    const districts=Object.keys((await import('../server-plugin/population.mjs')).populationTemplate(world,'loc_bs').districts);
    const chosen=[];
    for(const [i,district]of districts.entries()){
        for(const destination of ['loc_bs',district]){const r=await engine.reduce(doc,{tool:'world_move',args:{destination},eventId:`live-${i}-${destination}`});doc=applyPatches(doc,r.patches);}
        const adult=Object.values(doc.state.created).filter(e=>e.generated==='population'&&e.home.district===district&&e.age>=18).sort((a,b)=>a.id.localeCompare(b.id))[0];
        if(adult)chosen.push(adult.id);
        if(chosen.length>=count)break;
    }
    return {engine,doc,people:chosen};
}

function mockClient(){
    return {calls:0,async generate(body,label){
        this.calls++;const user=JSON.parse(body.messages.at(-1).content),i=user.identity;
        const profile=user.task==='自查'?user.draft:{personality:{traits:['稳重'],values:['守约'],flaws:['固执']},voice:{register:'平稳',accent:'河谷口音',habits:['先问清楚'],samples:['你说，我听。']},
            background:`${i.name}在本区以${i.occupation}为生。`,currentConcern:'手上的活别误了时辰。',goals:['把活做稳'],fears:['家人生病'],knowledge:{unknown:['外地消息']},
            relationships:i.household.map(h=>({with:h.id,relation:h.relation,note:'同住'})),visibleFeature:'袖口挽起'};
        return {choices:[{message:{content:JSON.stringify(user.task==='自查'?{issues:[],profile}:profile)}}],label};
    }};
}

async function main(){
    const live=flag('--live'),count=Math.min(Number(value('--count',LIMITS.maxPeople)),LIMITS.maxPeople);
    if(!Number.isInteger(count)||count<1)throw Error('--count 须为 1–6');
    const {engine,doc,people}=await sampleAdults(count);
    let client,budget=null,cardBefore=0;const ledgerFile=path.resolve(ROOT,value('--ledger','world/drafts/w1/budget.json'));
    if(live){
        if(!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY 未配置');
        console.log('DEEPSEEK_API_KEY：已配置（不显示值）');
        const {DeepSeekClient}=await import('./deepseek-client.mjs');const {openContentBudget}=await import('./content-budget.mjs');
        const transport=new DeepSeekClient({budgetYuan:20,logFile:path.join(ROOT,'logs/population-live-usage.jsonl')});
        budget=await openContentBudget({file:ledgerFile,client:transport,cardId:LIMITS.cardId,
            allocation:{cardId:LIMITS.cardId,incrementLimitYuan:LIMITS.maxYuan,waveLimitYuan:20,maxRequests:LIMITS.maxCalls}});
        cardBefore=budget.ledger.cards[LIMITS.cardId].spentYuan;
        client={calls:0,async generate(body,label){
            if(this.calls>=LIMITS.maxCalls)throw Object.assign(Error('达到18次调用上限'),{code:'LIVE_STOP'});
            if(budget.ledger.cards[LIMITS.cardId].spentYuan+budget.ledger.cards[LIMITS.cardId].reservedYuan>=LIMITS.maxYuan)throw Object.assign(Error('达到0.8元上限'),{code:'LIVE_STOP'});
            this.calls++;return budget.request(body,label);
        }};
    }else client=mockClient();
    const generate=modelProfileGenerator(client,{labelPrefix:live?'t143s5-live':'t143s5-dry'});
    const results=[];
    const draft=document=>{const d={document,patches:[],get:(...p)=>p.reduce((o,k)=>o?.[k],d.document),set(p,v){const patch={op:'set',path:p,value:v};d.document=applyPatches(d.document,[patch]);d.patches.push(patch);}};return d;};
    async function attempt(person){
        const brief=profileBrief(doc,person),template=doc.state.population.loc_bs.template;
        try{
            const generated=await generate(brief,{template});
            const errors=checkGeneratedProfile(doc.state.created[person],generated.profile,{template});
            if(errors.length)return {person,name:brief.identity.name,status:'failed',errors};
            // Same acceptance path as the campaign reducer, on a throwaway copy.
            acceptPopulationProfile(draft(doc),engine,{person,outcome:'accepted',profile:generated.profile});
            return {person,name:brief.identity.name,status:'full',selfCheckIssues:generated.selfCheck.issues,codeFindingsBeforeSelfCheck:generated.selfCheck.codeFindingsBeforeReview,profile:generated.profile};
        }catch(error){
            if(['LIVE_STOP','CONTENT_BUDGET_STOP'].includes(error.code))throw error;
            return {person,name:brief.identity.name,status:'failed',errors:[String(error.message).slice(0,300)]};
        }
    }
    try{
        for(const [i,person]of people.entries()){
            if(client.calls+2>LIMITS.maxCalls){results.push({person,status:'skipped',reason:'调用上限'});continue;}
            let outcome=await attempt(person);
            // One retry per person, only while every remaining person keeps its two calls.
            if(outcome.status==='failed'&&client.calls+2+(people.length-i-1)*2<=LIMITS.maxCalls){const retry=await attempt(person);retry.firstAttempt=outcome.errors;outcome=retry;}
            results.push(outcome);
        }
    }catch(error){if(!['LIVE_STOP','CONTENT_BUDGET_STOP'].includes(error.code))throw error;}
    finally{
        const spent=budget?budget.ledger.cards[LIMITS.cardId].spentYuan-cardBefore:0;
        if(budget)await budget.close();
        const report={mode:live?'live':'dry-run',calls:client.calls,costUpperYuan:spent,limits:LIMITS,passed:results.filter(r=>r.status==='full').length,people:results};
        await fs.mkdir(path.join(ROOT,'logs'),{recursive:true});
        const out=path.join(ROOT,'logs',`population-live-check-${live?'live':'dry'}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
        await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');
        console.log(`${report.mode}：${report.passed}/${results.length} 通过，调用${report.calls}次，费用上界${spent.toFixed(6)}元；报告 ${path.relative(ROOT,out)}`);
        for(const r of results)console.log(` ${r.person} ${r.name??''} ${r.status}${r.errors?`：${r.errors.join('；')}`:''}`);
    }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
