import fs from 'node:fs/promises';
import * as OpenCC from 'opencc-js';
import {isDeepStrictEqual} from 'node:util';
import {consistencyThreshold} from '../server-plugin/consistency-outcome.mjs';

const simplify=OpenCC.Converter({from:'tw',to:'cn'});
const cliches=JSON.parse(await fs.readFile(new URL('../prompt/cliches.json',import.meta.url),'utf8'));
const ids=Array.from({length:7},(_,i)=>`V${i+1}`);
const definition=({pass,actual,...rule})=>rule;

export function languageChecks(turns){
    const replies=turns.map(turn=>turn.visible??''),text=replies.join('\n');
    const characters=Array.from(text.replace(/\s/gu,'')).length;
    const hits=cliches.flatMap(phrase=>replies.flatMap((reply,turn)=>Array.from(reply.matchAll(new RegExp(phrase,'gu')),match=>({turn,quote:match[0]}))));
    const similes=replies.map((reply,turn)=>{
        const matches=reply.match(/仿佛[^。！？；\n]*?一般/gu)??[];
        hits.push(...matches.map(quote=>({turn,quote})));
        return {turn,count:matches.length};
    });
    return {simplified:simplify(text)===text,characters,clicheHits:hits,
        clichesPerThousand:characters?hits.length*1000/characters:null,simileOverflow:similes.filter(row=>row.count>1)};
}

// The runner persists these rows. Scripted HTTP runs demonstrate assertions,
// but cannot satisfy the real model and narrative review evidence gate.
export function summarizeLanguageAcceptance(results,scenarios,repetitions=1){
    const selected=scenarios.filter(s=>s.requirements?.some(id=>ids.includes(id))&&s.rubric?.languageRequirements);
    const sessions=selected.flatMap(scenario=>Array.from({length:repetitions},(_,i)=>{
        const matches=results.filter(r=>r.id===scenario.id&&r.attempt===i+1),result=matches.length===1?matches[0]:null;
        const complete=Boolean(result&&result.turns?.length===scenario.turns.length&&result.turns.every((turn,index)=>
            turn.index===index&&turn.input===scenario.turns[index].input&&typeof turn.visible==='string'&&turn.visible.trim().length>0));
        const ledgerPass=complete&&result.turns.every((turn,index)=>!turn.errors?.length&&scenario.turns[index].assertions.every(rule=>
            turn.assertions?.some(row=>row.pass===true&&isDeepStrictEqual(definition(row),rule))));
        const realModelMeasured=complete&&result.turns.every(turn=>turn.requests?.length>0&&turn.requests.every(request=>
            typeof request.model==='string'&&typeof request.timestamp==='string'&&Number.isFinite(request.latencyMs)&&
            Number.isFinite(request.usage?.prompt_tokens)&&Number.isFinite(request.usage?.completion_tokens)));
        const reviewComplete=result?.review?.complete===true&&result.review.parts?.length>0&&
            result.review.parts.reduce((n,part)=>n+part.count,0)===scenario.turns.length;
        return {id:scenario.id,attempt:i+1,complete,ledgerPass,realModelMeasured,reviewComplete,
            consistencyPass:result?.consistencyPass===true,checks:complete?languageChecks(result.turns):null,review:result?.review,scenario};
    }));
    const rows=ids.map(id=>{
        const relevant=sessions.filter(s=>s.scenario.requirements.includes(id));
        const measured=relevant.length>0&&relevant.every(s=>s.complete&&(id==='V1'||id==='V6'||s.reviewComplete&&Number.isFinite(s.review.scores?.[id])));
        let score=null;
        if(measured){
            if(id==='V1')score=relevant.every(s=>s.checks.simplified)?100:0;
            else if(id==='V6'){
                const characters=relevant.reduce((n,s)=>n+s.checks.characters,0),hits=relevant.reduce((n,s)=>n+s.checks.clicheHits.length,0);
                score=characters>0&&hits*1000/characters<=0.5&&relevant.every(s=>!s.checks.simileOverflow.length)?100:0;
            }else score=relevant.reduce((n,s)=>n+s.review.scores[id]*s.scenario.turns.length,0)/relevant.reduce((n,s)=>n+s.scenario.turns.length,0);
        }
        return {id,measured,score,pass:measured&&score>=95};
    });
    const complete=sessions.length>0&&sessions.every(s=>s.complete),realModelMeasured=complete&&sessions.every(s=>s.realModelMeasured);
    const relevant=results.filter(r=>scenarios.some(s=>s.id===r.id&&s.requirements?.some(id=>ids.includes(id))));
    const ledgerPass=complete&&sessions.every(s=>s.ledgerPass),reviewsComplete=complete&&sessions.every(s=>s.reviewComplete)&&consistencyThreshold(relevant,.95);
    return {scope:'V1–V7逐项≥95，陈词≤0.5次/千字；时间与库存断言100%。离线准备不计真实通过',complete,realModelMeasured,ledgerPass,reviewsComplete,
        thresholdReached:complete&&realModelMeasured&&ledgerPass&&reviewsComplete&&rows.every(row=>row.pass),rows,
        sessions:sessions.map(({review,scenario,...session})=>session)};
}
